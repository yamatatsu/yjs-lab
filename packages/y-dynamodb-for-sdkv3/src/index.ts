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
): { ydoc: Y.Doc; update: Uint8Array } => {
  const ydoc = new Y.Doc();
  ydoc.transact(() => {
    updates.forEach((update) => {
      Y.applyUpdate(ydoc, update);
    });
  });
  return {
    ydoc,
    update: Y.encodeStateAsUpdate(ydoc),
  };
};

type Config = {
  tableName: string;
};
type TransactCallback<T> = () => Promise<T>;

export default class DynamoDBPersistence {
  private readonly client: YDynamoDBClient;

  constructor(
    db: DynamoDBClient,
    config: Config = { tableName: "y-dynamodb" }
  ) {
    this.client = new YDynamoDBClient(db, config.tableName);
  }

  async getYDoc(docName: string): Promise<Y.Doc | null> {
    return this.transact(async () => {
      const { updates, deleteUpdates } = await this.client.getUpdates(docName);

      const { ydoc, update } = mergeUpdates(updates);
      if (updates.length > PREFERRED_TRIM_SIZE) {
        await this._flush(docName, update, deleteUpdates);
      }
      return ydoc;
    });
  }

  async storeUpdate(docName: string, update: Uint8Array): Promise<void> {
    await this.transact(() =>
      this.client.putUpdate(docName, new Date(), update)
    );
  }

  async flushDocument(docName: string): Promise<void> {
    await this.transact(async () => {
      const { updates, deleteUpdates } = await this.client.getUpdates(docName);
      const { update } = mergeUpdates(updates);
      await this._flush(docName, update, deleteUpdates);
    });
  }

  async getStateVector(docName: string): Promise<Uint8Array | null> {
    const ydoc = await this.getYDoc(docName);
    if (!ydoc) return null;
    return Y.encodeStateVector(ydoc);
  }

  async getDiff(
    docName: string,
    stateVector: Uint8Array
  ): Promise<Uint8Array | null> {
    const ydoc = await this.getYDoc(docName);
    if (!ydoc) return null;
    return Y.encodeStateAsUpdate(ydoc, stateVector);
  }

  async clearDocument(docName: string): Promise<void> {
    await this.transact(async () => this.client.deleteDocument(docName));
  }

  private async _flush(
    docName: string,
    stateAsUpdate: Uint8Array,
    deleteUpdates: () => Promise<void>
  ): Promise<void> {
    await this.client.putUpdate(docName, new Date(), stateAsUpdate);
    await deleteUpdates();
  }

  // Execute an transaction on a database. This will ensure that other processes are currently not writing.
  private currentTransaction: Promise<any> = Promise.resolve();
  private async transact<T>(f: TransactCallback<T>): Promise<T | null> {
    this.currentTransaction = this.currentTransaction
      .then(() => f())
      .catch((err) => {
        console.warn("Error during y-dynamodb transaction", err);
        return null;
      });

    return this.currentTransaction;
  }
}
