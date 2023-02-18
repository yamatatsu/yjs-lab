import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, GetCommandInput } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME!;
const doc = DynamoDBDocument.from(
  new DynamoDBClient({
    ...(process.env.MOCK_DYNAMODB_ENDPOINT && {
      endpoint: process.env.MOCK_DYNAMODB_ENDPOINT,
      sslEnabled: false,
      region: "local",
    }),
  })
);

export const DB = {
  get: async (input: Omit<GetCommandInput, "TableName">) => {
    const { Item } = await doc.get({ TableName: TABLE_NAME, ...input });
    return Item ?? null;
  },
};
