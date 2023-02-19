process.env.TABLE_NAME = "y-aws-cdk-table";

import { handler } from "../lib/y-aws-cdk-draft-stack.ConnectHandler";
import { DB } from "./utils/dynamodb";

test("success", async () => {
  const res = await handler({
    requestContext: {
      connectionId: "test-connectionId",
      domainName: "test.example.com",
      stage: "prod",
      authorizer: { roomId: "test-room" },
    },
    isBase64Encoded: false,
  });
  expect(res).toEqual({
    statusCode: 200,
    body: "Connected",
    headers: { "Sec-WebSocket-Protocol": "test-room" },
  });

  const item = await DB.get({
    Key: { pk: "test-room", sk: "test-connectionId" },
  });
  expect(item).toEqual({
    pk: "test-room",
    sk: "test-connectionId",
    roomId: "test-room",
    connectionId: "test-connectionId",
  });
});
