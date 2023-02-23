process.env.TABLE_NAME = "y-aws-cdk-table";

import { handler } from "../lib/y-aws-cdk-draft-stack.ConnectHandler";
import { DB } from "./utils/dynamodb";

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
