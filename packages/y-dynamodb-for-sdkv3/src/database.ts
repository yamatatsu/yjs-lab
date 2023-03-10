import {
  DynamoDBClient,
  BatchWriteItemCommand,
  PutItemCommand,
  PutItemInput,
  QueryCommand,
  QueryInput,
  WriteRequest,
  AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { uniq } from "./uniqueId";

type DynamodbItem = {
  sortKey: AttributeValue.SMember;
  value: AttributeValue.BMember;
};

const createUpdateKey = (date?: Date): string =>
  `update:${date ? `${date.toISOString()}_${uniq()}` : ""}`;

/**
 * This class concealing the schema of database.
 */
export default class YDynamoDBClient {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {}

  putUpdate(docName: string, date: Date, update: Uint8Array): Promise<void> {
    return this.put(docName, createUpdateKey(date), update);
  }

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
        value: { B: val },
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
}

const v1PKey = (docName: string) => `v1:${docName}`;

function chunk<T>(arr: T[], size: number = 25): T[][] {
  if (arr.length === 0) {
    return [];
  }
  return [arr.slice(0, size), ...chunk(arr.slice(size), size)];
}
