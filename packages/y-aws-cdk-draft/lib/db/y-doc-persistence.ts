import DynamodbPersistence from "y-dynamodb-for-sdkv3";
import { client } from "./dynamodb";

export const persistence = new DynamodbPersistence(client);
