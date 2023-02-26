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
import * as buffer from "lib0/buffer";
import { stateVectorEncoding, valueEncoding } from "./encoding";

const createUpdateKey = (clock?: number): string =>
  `update:${clock?.toString().padStart(64, "0") ?? ""}`;
const createMetaKey = (metaKey: string): string => `meta:${metaKey}`;
const createStateVectorKey = (): string => "sv";

type DynamodbItem = {
  ykeysort: AttributeValue.SMember;
  value: AttributeValue.BMember;
};

/**
 * This class concealing the schema of database.
 */
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
      createStateVectorKey(),
      stateVectorEncoding.encode({ sv, clock })
    );
  }

  async getStateVector(
    docName: string
  ): Promise<{ sv: Uint8Array | null; clock: number }> {
    const item = await this.get(docName, createStateVectorKey());
    /* istanbul ignore if */
    if (item === null) {
      // no state vector created yet or no document exists
      return { sv: null, clock: -1 };
    }
    return stateVectorEncoding.decode(item.value.B);
  }

  deleteStateVector(docName: string): Promise<void> {
    return this.delete(docName, createStateVectorKey());
  }

  // Update

  putUpdate(docName: string, clock: number, update: Uint8Array): Promise<void> {
    return this.put(docName, createUpdateKey(clock + 1), update);
  }

  /**
   * Get all document updates for a specific document.
   */
  async getUpdates(docName: string): Promise<Uint8Array[]> {
    const items = await this.query({
      ...this.createBeginsWithQueryInput(docName, createUpdateKey()),
    });
    return items.map((item) => item.value.B);
  }

  /**
   * @return Returns -1 if this document doesn't exist yet
   */
  async getCurrentUpdateClock(docName: string): Promise<number> {
    const items = await this.query({
      ...this.createBeginsWithQueryInput(docName, createUpdateKey()),
      Limit: 1,
      ScanIndexForward: false,
    });

    if (!items[0]?.ykeysort) return -1;

    return Number(items[0].ykeysort.S.replace("update:", ""));
  }

  /**
   * @param docName
   * @param from Greater than or equal
   * @param to lower than (not equal)
   */
  async deleteUpdatesRange(
    docName: string,
    from: number,
    to: number
  ): Promise<void> {
    if (from >= to) {
      return;
    }

    const items = await this.query({
      ...this.createBetweenQueryInput(
        docName,
        createUpdateKey(from),
        createUpdateKey(to - 1)
      ),
      ProjectionExpression: "ykeysort",
    });

    await this.clearItems(docName, items);
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
      metas.set(
        // TODO: refactoring
        item.ykeysort.S.replace("meta:", ""),
        buffer.decodeAny(item.value.B)
      );
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
      ProjectionExpression: "ykeysort",
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
            ydocname: { S: v1PKey(docName) },
            ykeysort: { S: item.ykeysort.S },
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

  private createBetweenQueryInput(
    docName: string,
    from: string,
    to: string
  ): QueryInput {
    return {
      TableName: this.tableName,
      KeyConditionExpression:
        "ydocname = :docName and ykeysort between :id1 and :id2",
      ExpressionAttributeValues: {
        ":docName": { S: v1PKey(docName) },
        ":id1": { S: from },
        ":id2": { S: to },
      },
    };
  }

  private createBeginsWithQueryInput(
    docName: string,
    prefix: string
  ): QueryInput {
    return {
      TableName: this.tableName,
      KeyConditionExpression:
        "ydocname = :docName and begins_with(ykeysort, :id)",
      ExpressionAttributeValues: {
        ":docName": { S: v1PKey(docName) },
        ":id": { S: prefix },
      },
    };
  }

  private createQueryAllInput(docName: string): QueryInput {
    return {
      TableName: this.tableName,
      KeyConditionExpression: "ydocname = :docName",
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
    const params = {
      Key: {
        ydocname: { S: v1PKey(docName) },
        ykeysort: { S: key },
      },
      TableName: this.tableName,
    };

    const data = await this.client.send(new GetItemCommand(params));
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
        ydocname: { S: v1PKey(docName) },
        ykeysort: { S: key },
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
        ydocname: { S: v1PKey(docName) },
        ykeysort: { S: key },
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
