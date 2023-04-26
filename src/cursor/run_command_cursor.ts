import type { BSONSerializeOptions, Document, Long } from '../bson';
import type { Db } from '../db';
import {
  MongoCursorExhaustedError,
  MongoRuntimeError,
  MongoUnexpectedServerResponseError
} from '../error';
import type { MongoClient } from '../mongo_client';
import { executeOperation } from '../operations/execute_operation';
import { GetMoreOperation } from '../operations/get_more';
import { KillCursorsOperation } from '../operations/kill_cursors';
import { RunCommandOperation } from '../operations/run_command';
import { ReadPreference, ReadPreferenceLike } from '../read_preference';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { List, MongoDBNamespace, ns } from '../utils';

/** @public */
export type RunCommandCursorOptions = {
  readPreference?: ReadPreferenceLike;
  session?: ClientSession;
} & BSONSerializeOptions;

/** @internal */
type RunCursorCommandResponse = {
  cursor: { id: bigint | Long | number; ns: string; firstBatch: Document[] };
  ok: 1;
};

/** @public */
export class RunCommandCursor {
  /** @internal */
  client: MongoClient;
  /** @internal */
  db: Db;
  /** @internal */
  options: RunCommandCursorOptions;
  /** @internal */
  documents: List<Document>;
  /** @internal */
  storedIterator: AsyncGenerator<Document> | null = null;
  /** @internal */
  getMoreOptions: { comment?: any; maxAwaitTimeMS?: number; batchSize?: number } = {};
  /** @internal */
  id: bigint | null = null;
  /** @internal */
  ns: MongoDBNamespace | null = null;
  /** @internal */
  server: Server | null = null;
  /** @internal */
  readPreference: ReadPreference;
  /** @internal */
  session: ClientSession;
  /** @internal */
  done = false;

  readonly command: Readonly<Record<string, any>>;

  set comment(comment: any) {
    this.getMoreOptions.comment = comment;
  }

  get comment() {
    return this.getMoreOptions.comment;
  }

  set maxTimeMS(maxAwaitTimeMS: number) {
    this.getMoreOptions.maxAwaitTimeMS = maxAwaitTimeMS;
  }

  get maxTimeMS() {
    return this.getMoreOptions.maxAwaitTimeMS ?? 0;
  }

  set batchSize(batchSize: number) {
    this.getMoreOptions.batchSize = batchSize;
  }

  get batchSize() {
    return this.getMoreOptions.batchSize ?? 0;
  }

  /** @internal */
  constructor(
    client: MongoClient,
    db: Db,
    command: Document | Map<string, any>,
    options: RunCommandCursorOptions = {}
  ) {
    this.client = client;
    this.db = db;
    this.command =
      Symbol.toStringTag in command && command[Symbol.toStringTag] === 'Map'
        ? Object.freeze(Object.fromEntries(command.entries()))
        : Object.freeze({ ...command });
    this.options = options;
    this.documents = new List();
    this.readPreference = ReadPreference.fromOptions(options) ?? ReadPreference.primary;
    this.session = options.session == null ? client.startSession({ owner: this }) : options.session;
  }

  /** @internal */
  private static getIdFromResponse(response: { cursor: { id: number | Long | bigint } }): bigint {
    return typeof response.cursor.id === 'number'
      ? BigInt(response.cursor.id)
      : typeof response.cursor.id === 'object'
      ? response.cursor.id.toBigInt()
      : response.cursor.id;
  }

  /** @internal */
  private async *iterator(): AsyncGenerator<Document> {
    if (this.done) {
      throw new MongoCursorExhaustedError('This cursor needs a nap');
    }

    try {
      await this.runCommand();
      while (this.documents.length) {
        const doc = this.documents.shift();
        if (doc != null) {
          yield doc;
        }
        if (this.documents.length === 0 && this.id !== 0n) {
          await this.getMore();
        }
      }
    } finally {
      await this.close().catch(() => null);
    }
  }

  /** @internal */
  private get asyncIterator(): AsyncGenerator<Document> {
    if (this.storedIterator == null) {
      this.storedIterator = this.iterator();
    }
    return this.storedIterator;
  }

  /** @internal */
  private async runCommand() {
    const operation = new RunCommandOperation<RunCursorCommandResponse>(this.db, this.command, {
      ...this.options,
      session: this.session,
      readPreference: this.readPreference
    });

    const commandResponse = await executeOperation(this.client, operation);

    if (commandResponse.cursor == null) {
      throw new MongoUnexpectedServerResponseError('command must return a cursor document');
    }

    this.id = RunCommandCursor.getIdFromResponse(commandResponse);
    this.ns = ns(commandResponse.cursor.ns);
    this.documents.pushMany(commandResponse.cursor.firstBatch);
    this.server = operation.server;
  }

  /** @internal */
  private async getMore() {
    if (this.ns == null || this.id == null || this.server == null) {
      throw new MongoRuntimeError('getMore cannot be invoked with null namespace, id, nor server');
    }

    const getMoreResponse = await executeOperation(
      this.client,
      new GetMoreOperation(this.ns, this.id, this.server, {
        ...this.options,
        session: this.session,
        readPreference: this.readPreference,
        ...this.getMoreOptions
      })
    );

    this.documents.pushMany(getMoreResponse.cursor.nextBatch);
    this.id = RunCommandCursor.getIdFromResponse(getMoreResponse);
  }

  /** @internal */
  async start(): Promise<void> {
    const result = await this.asyncIterator.next();
    if (!result.done) this.documents.unshift(result.value);
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Document> {
    if (this.done) {
      throw new MongoCursorExhaustedError('This cursor needs a nap');
    }
    yield* this.asyncIterator;
  }

  async next(): Promise<Document | null> {
    if (this.done) {
      throw new MongoCursorExhaustedError('This cursor needs a nap');
    }

    const result = await this.asyncIterator.next();

    return result.done ? null : result.value;
  }

  async toArray() {
    const documents = new List();
    for await (const doc of this) {
      documents.push(doc);
    }
    return documents.toArray();
  }

  async close() {
    if (this.done) {
      return;
    }
    if (this.id != null && this.id !== 0n && this.ns != null && this.server != null) {
      const options = this.session.hasEnded ? {} : { session: this.session };
      const killCursorsOperation = new KillCursorsOperation(this.id, this.ns, this.server, options);
      await executeOperation(this.client, killCursorsOperation).catch(() => null);
    }
    if (this.session.owner === this) {
      await this.session.endSession().catch(() => null);
    }
    this.done = true;
  }
}
