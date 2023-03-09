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
  GetItemInput,
} from "@aws-sdk/client-dynamodb";
import * as buffer from "lib0/buffer";
import { valueEncoding } from "./encoding";
import { nanoid } from "nanoid";

type DynamodbItem = {
  sortKey: AttributeValue.SMember;
  value: AttributeValue.BMember;
};

const createUpdateKey = (date?: Date): string =>
  `update:${date ? `${date.toISOString()}_${nanoid()}` : ""}`;
const createMetaKey = (metaKey: string): string => `meta:${metaKey}`;

const getMetaKey = (item: DynamodbItem): string =>
  item.sortKey.S.replace("meta:", "");

/**
 * This class concealing the schema of database.
 */
export default class YDynamoDBClient {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {}

  // Update

  putUpdate(docName: string, date: Date, update: Uint8Array): Promise<void> {
    return this.put(docName, createUpdateKey(date), update);
  }

  /**
   * Get all document updates for a specific document.
   */
  async getUpdates(
    docName: string
  ): Promise<{ updates: Uint8Array[]; deleteUpdates: () => Promise<void> }> {
    const items = await this.query({
      ...this.createBeginsWithQueryInput(docName, createUpdateKey()),
    });
    return {
      updates: items.map((item) => item.value.B),
      deleteUpdates: () => this.clearItems(docName, items),
    };
  }

  // Meta

  putMeta(docName: string, metaKey: string, value: any): Promise<void> {
    return this.put(docName, createMetaKey(metaKey), buffer.encodeAny(value));
  }

  async getMetas(docName: string): Promise<Map<string, any>> {
    const items = await this.query({
      ...this.createBeginsWithQueryInput(docName, createMetaKey("")),
    });
    const metas = new Map();
    items.forEach((item) => {
      metas.set(getMetaKey(item), buffer.decodeAny(item.value.B));
    });
    return metas;
  }

  async getMeta(docName: string, metaKey: string): Promise<any | null> {
    const item = await this.get(docName, createMetaKey(metaKey));
    return item && buffer.decodeAny(item.value.B);
  }

  deleteMeta(docName: string, metaKey: string): Promise<void> {
    return this.delete(docName, createMetaKey(metaKey));
  }

  // Document

  async deleteDocument(docName: string): Promise<void> {
    const items = await this.query({
      ...this.createQueryAllInput(docName),
      ProjectionExpression: "sortKey",
    });
    await this.clearItems(docName, items);
  }

  // ===============
  // private

  private async clearItems(
    docName: string,
    items: DynamodbItem[]
  ): Promise<void> {
    // DynamoDB only allows a maximum of 25 items in bulk updates
    // So need to chunk list of items
    const requests = items.map(
      (item): WriteRequest => ({
        DeleteRequest: {
          Key: {
            docName: { S: v1PKey(docName) },
            sortKey: { S: item.sortKey.S },
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

  private createBeginsWithQueryInput(
    docName: string,
    prefix: string
  ): QueryInput {
    return {
      TableName: this.tableName,
      KeyConditionExpression:
        "docName = :docName and begins_with(sortKey, :id)",
      ExpressionAttributeValues: {
        ":docName": { S: v1PKey(docName) },
        ":id": { S: prefix },
      },
    };
  }

  private createQueryAllInput(docName: string): QueryInput {
    return {
      TableName: this.tableName,
      KeyConditionExpression: "docName = :docName",
      ExpressionAttributeValues: {
        ":docName": { S: v1PKey(docName) },
      },
    };
  }

  private async query(input: QueryInput): Promise<DynamodbItem[]> {
    const data = await this.client.send(new QueryCommand(input));
    return (data.Items ?? []) as DynamodbItem[];
  }

  private async get(
    docName: string,
    key: string
  ): Promise<DynamodbItem | null> {
    const input: GetItemInput = {
      TableName: this.tableName,
      Key: {
        docName: { S: v1PKey(docName) },
        sortKey: { S: key },
      },
    };

    const data = await this.client.send(new GetItemCommand(input));
    if (!data.Item) {
      return null;
    }
    return data.Item as DynamodbItem;
  }

  private async put(
    docName: string,
    key: string,
    val: Uint8Array
  ): Promise<void> {
    const input: PutItemInput = {
      TableName: this.tableName,
      ReturnConsumedCapacity: "TOTAL",
      Item: {
        docName: { S: v1PKey(docName) },
        sortKey: { S: key },
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

  private async delete(docName: string, key: string): Promise<void> {
    const input: DeleteItemInput = {
      Key: {
        docName: { S: v1PKey(docName) },
        sortKey: { S: key },
      },
      TableName: this.tableName,
    };

    await this.client.send(new DeleteItemCommand(input));
  }
}

const v1PKey = (docName: string) => `v1:${docName}`;

function chunk<T>(arr: T[], size: number = 25): T[][] {
  if (arr.length === 0) {
    return [];
  }
  return [arr.slice(0, size), ...chunk(arr.slice(size), size)];
}
