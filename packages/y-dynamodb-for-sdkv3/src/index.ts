import * as Y from "yjs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import YDynamoDBClient from "./database";

export const PREFERRED_TRIM_SIZE = 500;

/**
 * For now this is a helper method that creates a Y.Doc and then re-encodes a document update.
 * In the future this will be handled by Yjs without creating a Y.Doc (constant memory consumption).
 */
const mergeUpdates = (
  updates: Uint8Array[]
): { ydoc: Y.Doc; update: Uint8Array; sv: Uint8Array } => {
  const ydoc = new Y.Doc();
  ydoc.transact(() => {
    updates.forEach((update) => {
      Y.applyUpdate(ydoc, update);
    });
  });
  return {
    ydoc,
    update: Y.encodeStateAsUpdate(ydoc),
    sv: Y.encodeStateVector(ydoc),
  };
};

/**
 * @returns the clock of the flushed doc
 */
const flushDocument = async (
  client: YDynamoDBClient,
  docName: string,
  stateAsUpdate: Uint8Array,
  stateVector: Uint8Array,
  deleteUpdates: () => Promise<void>
): Promise<number> => {
  const clock = await storeUpdate(client, docName, stateAsUpdate);
  await client.putStateVector(docName, stateVector, clock);
  await deleteUpdates();
  return clock;
};

/**
 * @returns the clock of the stored update
 */
const storeUpdate = async (
  client: YDynamoDBClient,
  docName: string,
  update: Uint8Array
): Promise<number> => {
  const clock = await client.getNextUpdateClock(docName);

  // first time for storeUpdate to the doc
  if (clock === 1) {
    // make sure that a state vector is always written, so we can search for available documents
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, update);
    const sv = Y.encodeStateVector(ydoc);
    await client.putStateVector(docName, sv, clock);
  }
  await client.putUpdate(docName, clock, update);
  return clock;
};

type Config = {
  tableName: string;
};
type TransactCallback = () => Promise<any>;

export default class DynamodbPersistence {
  private readonly client: YDynamoDBClient;

  constructor(
    db: DynamoDBClient,
    config: Config = { tableName: "y-dynamodb" }
  ) {
    this.client = new YDynamoDBClient(db, config.tableName);
  }

  getYDoc(docName: string): Promise<Y.Doc> {
    return this.transact(async () => {
      const { updates, deleteUpdates } = await this.client.getUpdates(docName);

      const { ydoc, update, sv } = mergeUpdates(updates);
      if (updates.length > PREFERRED_TRIM_SIZE) {
        await flushDocument(this.client, docName, update, sv, deleteUpdates);
      }
      return ydoc;
    });
  }

  storeUpdate(docName: string, update: Uint8Array): Promise<void> {
    return this.transact(() => storeUpdate(this.client, docName, update));
  }

  /**
   * @returns the clock of the flushed doc
   */
  flushDocument(docName: string): Promise<number> {
    return this.transact(async () => {
      const { updates, deleteUpdates } = await this.client.getUpdates(docName);
      const { update, sv } = mergeUpdates(updates);
      return flushDocument(this.client, docName, update, sv, deleteUpdates);
    });
  }

  getStateVector(docName: string): Promise<Uint8Array> {
    return this.transact(async () => {
      const { clock, sv } = await this.client.getStateVector(docName);
      let curClock: number | null = -1;
      /* istanbul ignore next */
      if (sv !== null) {
        curClock = await this.client.getCurrentUpdateClock(docName);
      }
      if (sv !== null && clock === curClock) {
        return sv;
      } else {
        // current state vector is outdated
        const { updates, deleteUpdates } = await this.client.getUpdates(
          docName
        );
        const { update, sv } = mergeUpdates(updates);
        await flushDocument(this.client, docName, update, sv, deleteUpdates);
        return sv;
      }
    });
  }

  async getDiff(docName: string, stateVector: Uint8Array): Promise<Uint8Array> {
    const ydoc = await this.getYDoc(docName);
    return Y.encodeStateAsUpdate(ydoc, stateVector);
  }

  clearDocument(docName: string): Promise<void> {
    return this.transact(async () => {
      await this.client.deleteDocument(docName);
    });
  }

  setMeta(docName: string, metaKey: string, value: any): Promise<void> {
    return this.transact(() => this.client.putMeta(docName, metaKey, value));
  }

  getMeta(docName: string, metaKey: string): Promise<any> {
    return this.transact(() => this.client.getMeta(docName, metaKey));
  }

  getMetas(docName: string): Promise<Map<string, any>> {
    return this.transact(() => this.client.getMetas(docName));
  }

  delMeta(docName: string, metaKey: string): Promise<void> {
    return this.transact(() => this.client.deleteMeta(docName, metaKey));
  }

  // Execute an transaction on a database. This will ensure that other processes are currently not writing.
  private currentTransaction: Promise<any> = Promise.resolve();
  private async transact(f: TransactCallback) {
    this.currentTransaction = this.currentTransaction
      .then(() => f())
      .catch((err) => {
        console.warn("Error during y-dynamodb transaction", err);
      });

    return this.currentTransaction;
  }
}
