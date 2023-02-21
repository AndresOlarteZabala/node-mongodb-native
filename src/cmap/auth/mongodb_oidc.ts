import { MongoInvalidArgumentError, MongoMissingCredentialsError } from '../../error';
import type { Callback } from '../../utils';
import type { HandshakeDocument } from '../connect';
import { type AuthContext, AuthProvider } from './auth_provider';
import type { MongoCredentials } from './mongo_credentials';
import { AwsDeviceWorkflow } from './mongodb_oidc/aws_device_workflow';
import { CallbackWorkflow } from './mongodb_oidc/callback_workflow';
import type { Workflow } from './mongodb_oidc/workflow';

/** @public */
export interface OIDCMechanismServerStep1 {
  authorizeEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizeEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  requestScopes?: string[];
}

/** @public */
export interface OIDCRequestTokenResult {
  accessToken: string;
  expiresInSeconds?: number;
  refreshToken?: string;
}

/** @public */
export type OIDCRequestFunction = (
  principalName: string,
  idl: OIDCMechanismServerStep1,
  timeout: AbortSignal
) => Promise<OIDCRequestTokenResult>;

/** @public */
export type OIDCRefreshFunction = (
  principalName: string,
  idl: OIDCMechanismServerStep1,
  result: OIDCRequestTokenResult,
  timeout: AbortSignal
) => Promise<OIDCRequestTokenResult>;

/** @internal */
const kWorkflow = Symbol('workflow');

/** @internal */
const DEVICE_WORKFLOWS = {
  aws: new AwsDeviceWorkflow(),
  azure: undefined,
  gcp: undefined
};

/**
 * OIDC auth provider.
 */
export class MongoDBOIDC extends AuthProvider {
  /** @internal */
  [kWorkflow]?: Workflow;

  /**
   * Instantiate the auth provider.
   */
  constructor() {
    super();
  }

  /**
   * Authenticate using OIDC
   */
  override auth(authContext: AuthContext, callback: Callback): void {
    const { connection, credentials } = authContext;

    if (!credentials) {
      return callback(new MongoMissingCredentialsError('AuthContext must provide credentials.'));
    }

    if (!this[kWorkflow]) {
      const workflow = createWorkflow(credentials);
      if (!workflow) {
        return callback(
          new MongoInvalidArgumentError(
            `Could not load workflow for device ${credentials.mechanismProperties.DEVICE_NAME}`
          )
        );
      }
      this[kWorkflow] = workflow;
    }
    this[kWorkflow].execute(connection, credentials, callback);
  }

  /**
   * Add the specualtive auth for the initial handshake.
   */
  override prepare(
    handshakeDoc: HandshakeDocument,
    authContext: AuthContext,
    callback: Callback<HandshakeDocument>
  ): void {
    callback(undefined, handshakeDoc);
  }
}

/**
 * Creates either a device workflow or callback workflow.
 */
function createWorkflow(credentials: MongoCredentials): Workflow | undefined {
  const deviceName = credentials.mechanismProperties.DEVICE_NAME;
  if (deviceName) {
    return DEVICE_WORKFLOWS[deviceName];
  }
  return new CallbackWorkflow();
}
