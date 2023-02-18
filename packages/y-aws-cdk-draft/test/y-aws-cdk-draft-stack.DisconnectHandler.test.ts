process.env.TABLE_NAME = "y-aws-cdk-table";

import { handler } from "../lib/y-aws-cdk-draft-stack.DisconnectHandler";
import { DB } from "./utils/dynamodb";

test("success", async () => {
  const res = await handler({
    requestContext: {
      connectionId: "connectionId_0",
      domainName: "test.example.com",
      stage: "prod",
      authorizer: { roomId: "roomId_0" },
    },
    isBase64Encoded: false,
  });
  expect(res).toEqual({ statusCode: 200, body: "Disconnected" });

  const item = await DB.get({
    Key: { pk: "roomId_0", sk: "connectionId_0" },
  });
  expect(item).toBeNull();
});
