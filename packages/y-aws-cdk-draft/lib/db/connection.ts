import {
  DynamoDBDocument,
  PutCommandInput,
  QueryCommandInput,
  DeleteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { client } from "./dynamodb";

const TABLE_NAME = process.env.TABLE_NAME!;
const doc = DynamoDBDocument.from(client);

const Connection = {
  put: async (input: Omit<PutCommandInput, "TableName">) => {
    await doc.put({ TableName: TABLE_NAME, ...input });
  },
  query: async (input: Omit<QueryCommandInput, "TableName">) => {
    const { Items } = await doc.query({ TableName: TABLE_NAME, ...input });
    return Items ?? [];
  },
  delete: async (input: Omit<DeleteCommandInput, "TableName">) => {
    await doc.delete({ TableName: TABLE_NAME, ...input });
  },
};
export default Connection;
