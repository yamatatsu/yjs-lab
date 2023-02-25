import {
  DynamoDBClient,
  BatchWriteItemCommand,
  DeleteItemCommand,
  DeleteItemInput,
  GetItemCommand,
  PutItemCommand,
  PutItemInput,
  QueryCommand,
  QueryInput,
  WriteRequest,
  AttributeValue,
} from "@aws-sdk/client-dynamodb";
import * as binary from "lib0/binary";
import * as buffer from "lib0/buffer";
import { stateVectorEncoding, valueEncoding, keyEncoding } from "./encoding";

type DocumentKey =
  | [string, string]
  | [string, string, string]
  | [string, string, string, string | number];

const createDocumentUpdateKey = (
  docName: string,
  clock: number
): DocumentKey => ["v1", docName, "update", clock];
const createDocumentMetaKey = (
  docName: string,
  metaKey: string
): DocumentKey => ["v1", docName, "meta", metaKey];
const createDocumentMetaEndKey = (docName: string): DocumentKey => [
  "v1",
  docName,
  "metb",
]; // simple trick
const createDocumentStateVectorKey = (docName: string): DocumentKey => [
  "v1_sv",
  docName,
];
const createDocumentFirstKey = (docName: string): DocumentKey => [
  "v1",
  docName,
];
const createDocumentLastKey = (docName: string): DocumentKey => [
  "v1",
  docName,
  "zzzzzzz",
];

type RawItem = {
  ykeysort: AttributeValue.BMember;
  value: AttributeValue.BMember;
};
type DynamoDBItem = { ykeysort: DocumentKey; value: Uint8Array };

export default class YDynamoDBClient {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {}

  // StateVector

  /**
   * @param docName
   * @param sv state vector
   * @param clock current clock of the document so we can determine when this stateVector was created
   */
  putStateVector(
    docName: string,
    sv: Uint8Array,
    clock: number
  ): Promise<void> {
    return this.put(
      docName,
      createDocumentStateVectorKey(docName),
      stateVectorEncoding.encode({ sv, clock })
    );
  }

  async getStateVector(
    docName: string
  ): Promise<{ sv: Uint8Array | null; clock: number }> {
    const item = await this.get(docName, createDocumentStateVectorKey(docName));
    /* istanbul ignore if */
    if (item === null) {
      // no state vector created yet or no document exists
      return { sv: null, clock: -1 };
    }
    return stateVectorEncoding.decode(item.value);
  }

  deleteStateVector(docName: string): Promise<void> {
    return this.delete(docName, createDocumentStateVectorKey(docName));
  }

  // Update

  putUpdate(docName: string, clock: number, update: Uint8Array): Promise<void> {
    return this.put(
      docName,
      createDocumentUpdateKey(docName, clock + 1),
      update
    );
  }

  /**
   * Get all document updates for a specific document.
   */
  getUpdates(docName: string): Promise<DynamoDBItem[]> {
    return this.query(
      docName,
      createDocumentUpdateKey(docName, 0),
      createDocumentUpdateKey(docName, binary.BITS32)
    );
  }

  /**
   * @param docName
   * @param from Greater than or equal
   * @param to lower than (not equal)
   */
  deleteUpdatesRange(docName: string, from: number, to: number): Promise<void> {
    return this.clearRange(
      docName,
      createDocumentUpdateKey(docName, from),
      createDocumentUpdateKey(docName, to - 1)
    );
  }

  // Meta

  putMeta(docName: string, metaKey: string, value: any): Promise<void> {
    return this.put(
      docName,
      createDocumentMetaKey(docName, metaKey),
      buffer.encodeAny(value)
    );
  }

  async getMetas(docName: string): Promise<Map<string, any>> {
    const items = await this.query(
      docName,
      createDocumentMetaKey(docName, ""),
      createDocumentMetaEndKey(docName)
    );
    const metas = new Map();
    items.forEach((item) => {
      metas.set(item.ykeysort[3], buffer.decodeAny(item.value));
    });
    return metas;
  }

  async getMeta(docName: string, metaKey: string): Promise<any | null> {
    const item = await this.get(
      docName,
      createDocumentMetaKey(docName, metaKey)
    );
    return item && buffer.decodeAny(item.value);
  }

  deleteMeta(docName: string, metaKey: string): Promise<void> {
    return this.delete(docName, createDocumentMetaKey(docName, metaKey));
  }

  // Document

  deleteDocument(docName: string): Promise<void> {
    return this.clearRange(
      docName,
      createDocumentFirstKey(docName),
      createDocumentLastKey(docName)
    );
  }

  // ===============
  // private

  private async clearRange(
    docName: string,
    gte: DocumentKey,
    lt: DocumentKey
  ): Promise<void> {
    // Get items in range
    const items = await this.query(docName, gte, lt);

    // DynamoDB only allows a maximum of 25 items in bulk updates
    // So need to chunk list of items
    const requests = items.map(
      (item): WriteRequest => ({
        DeleteRequest: {
          Key: {
            ydocname: { S: v1PKey(docName) },
            // TODO: we can optimize it.
            ykeysort: { B: keyEncoding.encode(item.ykeysort) },
          },
        },
      })
    );

    await Promise.all(
      chunk(requests).map((_requests) =>
        this.client.send(
          new BatchWriteItemCommand({
            RequestItems: { [this.tableName]: _requests },
          })
        )
      )
    );
  }

  private async query(
    docName: string,
    from: DocumentKey,
    to: DocumentKey,
    onlyYkeysort: boolean = false
  ): Promise<DynamoDBItem[]> {
    const input: QueryInput = {
      TableName: this.tableName,
      KeyConditionExpression:
        "ydocname = :docName and ykeysort between :id1 and :id2",
      ExpressionAttributeValues: {
        ":docName": { S: v1PKey(docName) },
        ":id1": { B: keyEncoding.encode(from) },
        ":id2": { B: keyEncoding.encode(to) },
      },
      ProjectionExpression: onlyYkeysort ? "ykeysort" : undefined,
      ScanIndexForward: true,
    };

    const data = await this.client.send(new QueryCommand(input));
    const items = (data.Items ?? []) as RawItem[];

    return items.map(decodeItem);
  }

  private async get(
    docName: string,
    key: DocumentKey
  ): Promise<DynamoDBItem | null> {
    const params = {
      Key: {
        ydocname: { S: v1PKey(docName) },
        ykeysort: { B: keyEncoding.encode(key) },
      },
      TableName: this.tableName,
    };

    const data = await this.client.send(new GetItemCommand(params));
    if (!data.Item) {
      return null;
    }
    const item = data.Item as RawItem;
    return decodeItem(item);
  }

  private async put(
    docName: string,
    key: DocumentKey,
    val: Uint8Array
  ): Promise<void> {
    const input: PutItemInput = {
      TableName: this.tableName,
      ReturnConsumedCapacity: "TOTAL",
      Item: {
        ydocname: { S: v1PKey(docName) },
        ykeysort: { B: keyEncoding.encode(key) },
        value: { B: valueEncoding.encode(val) },
      },
    };

    try {
      await this.client.send(new PutItemCommand(input));
    } catch (err) {
      console.error(
        "Unable to add item. Error JSON:",
        JSON.stringify(err, null, 2)
      );
      throw err;
    }
  }

  private async delete(docName: string, key: DocumentKey): Promise<void> {
    const input: DeleteItemInput = {
      Key: {
        ydocname: { S: v1PKey(docName) },
        ykeysort: { B: keyEncoding.encode(key) },
      },
      TableName: this.tableName,
    };

    await this.client.send(new DeleteItemCommand(input));
  }
}

const v1PKey = (docName: string) => `v1:${docName}`;

const decodeItem = (item: RawItem): DynamoDBItem => ({
  ykeysort: keyEncoding.decode(item.ykeysort.B),
  value: valueEncoding.decode(item.value.B),
});

function chunk<T>(arr: T[], size: number = 25): T[][] {
  if (arr.length === 0) {
    return [];
  }
  return [arr.slice(0, size), ...chunk(arr.slice(size), size)];
}
