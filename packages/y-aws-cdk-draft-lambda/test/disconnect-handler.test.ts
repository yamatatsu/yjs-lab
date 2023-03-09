// @vitest-environment dynalite

process.env.TABLE_NAME = "y-aws-cdk-table";

import { test, expect } from "vitest";
import { useDynalite } from "vitest-environment-dynalite";
import { handler } from "../src/disconnect-handler";
import { DB } from "./utils/dynamodb";

useDynalite();

test("success", async () => {
  const res = await handler({
    requestContext: {
      connectionId: "connectionId_0",
      domainName: "test.example.com",
      stage: "prod",
      authorizer: { docId: "docId_0" },
    },
    isBase64Encoded: false,
  });
  expect(res).toEqual({ statusCode: 200, body: "Disconnected" });

  const item = await DB.get({
    Key: { pk: "docId_0", sk: "connectionId_0" },
  });
  expect(item).toBeNull();
});
