import { Binary, BSON, type Document } from 'bson';

import {
  MONGODB_ERROR_CODES,
  MongoError,
  MongoInvalidArgumentError,
  MongoMissingCredentialsError
} from '../../../error';
import { ns } from '../../../utils';
import type { Connection } from '../../connection';
import type { MongoCredentials } from '../mongo_credentials';
import {
  IdPServerInfo,
  IdPServerResponse,
  OIDC_VERSION,
  OIDCCallbackContext,
  OIDCRefreshFunction,
  OIDCRequestFunction
} from '../mongodb_oidc';
import { AuthMechanism } from '../providers';
import { TokenEntryCache } from './token_entry_cache';
import type { Workflow } from './workflow';

/** 5 minutes in seconds */
const TIMEOUT_S = 300;

/** Properties allowed on results of callbacks. */
const RESULT_PROPERTIES = ['accessToken', 'expiresInSeconds', 'refreshToken'];

/**
 * OIDC implementation of a callback based workflow.
 * @internal
 */
export class CallbackWorkflow implements Workflow {
  cache: TokenEntryCache;

  /**
   * Instantiate the workflow
   */
  constructor() {
    this.cache = new TokenEntryCache();
  }

  /**
   * Get the document to add for speculative authentication. This also needs
   * to add a db field from the credentials source.
   */
  async speculativeAuth(credentials: MongoCredentials): Promise<Document> {
    const document = startCommandDocument(credentials);
    document.db = credentials.source;
    return { speculativeAuthenticate: document };
  }

  /**
   * Execute the OIDC callback workflow.
   */
  async execute(
    connection: Connection,
    credentials: MongoCredentials,
    reauthenticating: boolean,
    response?: Document
  ): Promise<Document> {
    const requestCallback = credentials.mechanismProperties.REQUEST_TOKEN_CALLBACK;
    const refreshCallback = credentials.mechanismProperties.REFRESH_TOKEN_CALLBACK;
    // At minimum a request callback must be provided by the user.
    if (!requestCallback) {
      throw new MongoInvalidArgumentError(
        'Auth mechanism property REQUEST_TOKEN_CALLBACK is required.'
      );
    }
    // Look for an existing entry in the cache.
    const entry = this.cache.getEntry(
      connection.address,
      credentials.username,
      requestCallback,
      refreshCallback || null
    );
    let result;
    // Reauthentication must go through all the steps again regards of a cache entry
    // being present.
    if (entry) {
      console.log('FOUND ENTRY');
      if (entry.isValid() && !reauthenticating) {
        console.log('ENTRY VALID, NOT REAUTH');
        // Presence of a valid cache entry means we can skip to the finishing step.
        result = await this.finishAuthentication(
          connection,
          credentials,
          entry.tokenResult,
          response?.speculativeAuthenticate?.conversationId
        );
      } else {
        console.log('NEED FETCH TOKEN', reauthenticating, response);
        // Presence of an expired cache entry means we must fetch a new one and
        // then execute the final step.
        const tokenResult = await this.fetchAccessToken(
          connection,
          credentials,
          entry.serverResult,
          reauthenticating,
          requestCallback,
          refreshCallback
        );
        try {
          result = await this.finishAuthentication(
            connection,
            credentials,
            tokenResult,
            reauthenticating ? undefined : response?.speculativeAuthenticate?.conversationId
          );
        } catch (error) {
          console.log('ERROR', error, reauthenticating);
          // If we are reauthenticating and this errors with reauthentication
          // required, we need to do the entire process over again and clear
          // the cache entry.
          if (
            reauthenticating &&
            error instanceof MongoError &&
            error.code === MONGODB_ERROR_CODES.Reauthenticate
          ) {
            this.cache.deleteEntry(
              connection.address,
              credentials.username || '',
              requestCallback,
              refreshCallback || null
            );
            result = await this.execute(connection, credentials, reauthenticating);
          } else {
            throw error;
          }
        }
      }
    } else {
      console.log('NO TOKEN');
      // No entry in the cache requires us to do all authentication steps
      // from start to finish, including getting a fresh token for the cache.
      const startDocument = await this.startAuthentication(
        connection,
        credentials,
        reauthenticating,
        response
      );
      const conversationId = startDocument.conversationId;
      const serverResult = BSON.deserialize(startDocument.payload.buffer) as IdPServerInfo;
      const tokenResult = await this.fetchAccessToken(
        connection,
        credentials,
        serverResult,
        reauthenticating,
        requestCallback,
        refreshCallback
      );
      result = await this.finishAuthentication(
        connection,
        credentials,
        tokenResult,
        conversationId
      );
    }
    return result;
  }

  /**
   * Starts the callback authentication process. If there is a speculative
   * authentication document from the initial handshake, then we will use that
   * value to get the issuer, otherwise we will send the saslStart command.
   */
  private async startAuthentication(
    connection: Connection,
    credentials: MongoCredentials,
    reauthenticating: boolean,
    response?: Document
  ): Promise<Document> {
    let result;
    if (!reauthenticating && response?.speculativeAuthenticate) {
      result = response.speculativeAuthenticate;
    } else {
      result = await connection.commandAsync(
        ns(credentials.source),
        startCommandDocument(credentials),
        undefined
      );
    }
    return result;
  }

  /**
   * Finishes the callback authentication process.
   */
  private async finishAuthentication(
    connection: Connection,
    credentials: MongoCredentials,
    tokenResult: IdPServerResponse,
    conversationId?: number
  ): Promise<Document> {
    const result = await connection.commandAsync(
      ns(credentials.source),
      finishCommandDocument(tokenResult.accessToken, conversationId),
      undefined
    );
    return result;
  }

  /**
   * Fetches an access token using either the request or refresh callbacks and
   * puts it in the cache.
   */
  private async fetchAccessToken(
    connection: Connection,
    credentials: MongoCredentials,
    serverInfo: IdPServerInfo,
    reauthenticating: boolean,
    requestCallback: OIDCRequestFunction,
    refreshCallback?: OIDCRefreshFunction
  ): Promise<IdPServerResponse> {
    // Get the token from the cache.
    const entry = this.cache.getEntry(
      connection.address,
      credentials.username,
      requestCallback,
      refreshCallback || null
    );
    let result;
    const context: OIDCCallbackContext = { timeoutSeconds: TIMEOUT_S, version: OIDC_VERSION };
    // Check if there's a token in the cache.
    if (entry) {
      // If the cache entry is valid, return the token result.
      if (entry.isValid() && !reauthenticating) {
        return entry.tokenResult;
      }
      // If the cache entry is not valid, remove it from the cache and first attempt
      // to use the refresh callback to get a new token. If no refresh callback
      // exists, then fallback to the request callback.
      if (refreshCallback) {
        context.refreshToken = entry.tokenResult.refreshToken;
        result = await refreshCallback(serverInfo, context);
      } else {
        result = await requestCallback(serverInfo, context);
      }
    } else {
      // With no token in the cache we use the request callback.
      result = await requestCallback(serverInfo, context);
    }
    // Validate that the result returned by the callback is acceptable.
    if (isCallbackResultInvalid(result)) {
      throw new MongoMissingCredentialsError(
        'User provided OIDC callbacks must return a valid object with an accessToken.'
      );
    }
    // Cleanup the cache.
    this.cache.deleteExpiredEntries();
    // Put the new entry into the cache.
    this.cache.addEntry(
      connection.address,
      credentials.username || '',
      requestCallback,
      refreshCallback || null,
      result,
      serverInfo
    );
    return result;
  }
}

/**
 * Generate the finishing command document for authentication. Will be a
 * saslStart or saslContinue depending on the presence of a conversation id.
 */
function finishCommandDocument(token: string, conversationId?: number): Document {
  if (conversationId) {
    return {
      saslContinue: 1,
      conversationId: conversationId,
      payload: new Binary(BSON.serialize({ jwt: token }))
    };
  }
  // saslContinue requires a conversationId in the command to be valid so in this
  // case the server allows "step two" to actually be a saslStart with the token
  // as the jwt since the use of the cached value has no correlating conversating
  // on the particular connection.
  return {
    saslStart: 1,
    mechanism: AuthMechanism.MONGODB_OIDC,
    payload: new Binary(BSON.serialize({ jwt: token }))
  };
}

/**
 * Determines if a result returned from a request or refresh callback
 * function is invalid. This means the result is nullish, doesn't contain
 * the accessToken required field, and does not contain extra fields.
 */
function isCallbackResultInvalid(tokenResult: any): boolean {
  if (!tokenResult) return true;
  if (!tokenResult.accessToken) return true;
  return !Object.getOwnPropertyNames(tokenResult).every(prop => RESULT_PROPERTIES.includes(prop));
}

/**
 * Generate the saslStart command document.
 */
function startCommandDocument(credentials: MongoCredentials): Document {
  const payload: Document = {};
  if (credentials.username) {
    payload.n = credentials.username;
  }
  return {
    saslStart: 1,
    autoAuthorize: 1,
    mechanism: AuthMechanism.MONGODB_OIDC,
    payload: new Binary(BSON.serialize(payload))
  };
}
