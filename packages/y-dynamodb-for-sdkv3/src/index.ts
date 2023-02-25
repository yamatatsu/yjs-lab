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
 * returns the clock of the flushed doc
 */
const flushDocument = async (
  client: YDynamoDBClient,
  docName: string,
  stateAsUpdate: Uint8Array,
  stateVector: Uint8Array
): Promise<number> => {
  const clock = await storeUpdate(client, docName, stateAsUpdate);
  await client.putStateVector(docName, stateVector, clock);
  await client.deleteUpdatesRange(docName, 0, clock);
  return clock;
};

/**
 * Returns the clock of the stored update
 */
const storeUpdate = async (
  client: YDynamoDBClient,
  docName: string,
  update: Uint8Array
): Promise<number> => {
  const clock = await client.getCurrentUpdateClock(docName);
  if (clock === -1) {
    // make sure that a state vector is always written, so we can search for available documents
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, update);
    const sv = Y.encodeStateVector(ydoc);
    await client.putStateVector(docName, sv, 0);
  }
  await client.putUpdate(docName, clock, update);
  return clock + 1;
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

  getYDoc(docName: string, outsideTransactionQueue: boolean = false) {
    const callback: TransactCallback = async () => {
      const updates = await this.client.getUpdates(docName);

      const { ydoc, update, sv } = mergeUpdates(updates);
      if (updates.length > PREFERRED_TRIM_SIZE) {
        await flushDocument(this.client, docName, update, sv);
      }
      return ydoc;
    };

    return outsideTransactionQueue ? callback() : this.transact(callback);
  }

  storeUpdate(
    docName: string,
    update: Uint8Array,
    outsideTransactionQueue: boolean = false
  ) {
    const callback: TransactCallback = () =>
      storeUpdate(this.client, docName, update);

    return outsideTransactionQueue ? callback() : this.transact(callback);
  }

  flushDocument(docName: string, outsideTransactionQueue: boolean = false) {
    const callback: TransactCallback = async () => {
      const updates = await this.client.getUpdates(docName);
      const { update, sv } = mergeUpdates(updates);
      return flushDocument(this.client, docName, update, sv);
    };

    return outsideTransactionQueue ? callback() : this.transact(callback);
  }

  getStateVector(docName: string, outsideTransactionQueue: boolean = false) {
    const callback: TransactCallback = async () => {
      const { clock, sv } = await this.client.getStateVector(docName);
      let curClock = -1;
      /* istanbul ignore next */
      if (sv !== null) {
        curClock = await this.client.getCurrentUpdateClock(docName);
      }
      if (sv !== null && clock === curClock) {
        return sv;
      } else {
        // current state vector is outdated
        const updates = await this.client.getUpdates(docName);
        const { update, sv } = mergeUpdates(updates);
        await flushDocument(this.client, docName, update, sv);
        return sv;
      }
    };

    return outsideTransactionQueue ? callback() : this.transact(callback);
  }

  async getDiff(docName: string, stateVector: Uint8Array) {
    const ydoc = await this.getYDoc(docName);
    return Y.encodeStateAsUpdate(ydoc, stateVector);
  }

  clearDocument(docName: string, outsideTransactionQueue: boolean = false) {
    const callback: TransactCallback = async () => {
      await this.client.deleteStateVector(docName);
      await this.client.deleteDocument(docName);
    };

    return outsideTransactionQueue ? callback() : this.transact(callback);
  }

  setMeta(
    docName: string,
    metaKey: string,
    value: any,
    outsideTransactionQueue: boolean = false
  ) {
    const callback: TransactCallback = () =>
      this.client.putMeta(docName, metaKey, value);

    return outsideTransactionQueue ? callback() : this.transact(callback);
  }

  getMeta(
    docName: string,
    metaKey: string,
    outsideTransactionQueue: boolean = false
  ) {
    const callback: TransactCallback = () =>
      this.client.getMeta(docName, metaKey);

    return outsideTransactionQueue ? callback() : this.transact(callback);
  }

  getMetas(docName: string, outsideTransactionQueue: boolean = false) {
    const callback: TransactCallback = () => this.client.getMetas(docName);

    return outsideTransactionQueue ? callback() : this.transact(callback);
  }

  delMeta(
    docName: string,
    metaKey: string,
    outsideTransactionQueue: boolean = false
  ) {
    const callback: TransactCallback = () =>
      this.client.deleteMeta(docName, metaKey);

    return outsideTransactionQueue ? callback() : this.transact(callback);
  }

  // Execute an transaction on a database. This will ensure that other processes are currently not writing.
  private currentTransaction: Promise<any> = Promise.resolve();
  private async transact(f: TransactCallback) {
    return this.currentTransaction.then(async () => {
      let res = null;
      /* istanbul ignore next */
      try {
        res = await f();
      } catch (err) {
        console.warn("Error during y-dynamodb transaction", err);
      }
      return res;
    });
  }
}
