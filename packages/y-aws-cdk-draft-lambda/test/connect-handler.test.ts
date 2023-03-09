// @vitest-environment dynalite

process.env.TABLE_NAME = "y-aws-cdk-table";

import { test, expect } from "vitest";
import { useDynalite } from "vitest-environment-dynalite";
import { handler } from "../src/connect-handler";
import { DB } from "./utils/dynamodb";

useDynalite();

test("success", async () => {
  const res = await handler({
    requestContext: {
      connectionId: "test-connectionId",
      domainName: "test.example.com",
      stage: "prod",
      authorizer: { docId: "test-docId" },
    },
    isBase64Encoded: false,
  });
  expect(res).toEqual({
    statusCode: 200,
    body: "Connected",
    headers: { "Sec-WebSocket-Protocol": "test-docId" },
  });

  const item = await DB.get({
    Key: { pk: "test-docId", sk: "test-connectionId" },
  });
  expect(item).toEqual({
    pk: "test-docId",
    sk: "test-connectionId",
    docId: "test-docId",
    connectionId: "test-connectionId",
  });
});
