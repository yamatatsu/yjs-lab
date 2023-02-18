process.env.TABLE_NAME = "y-aws-cdk-table";

import { handler } from "../lib/y-aws-cdk-draft-stack.DefaultHandler";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { mockClient } from "aws-sdk-client-mock";

const apiGatewayManagementApiMock = mockClient(ApiGatewayManagementApiClient);

beforeEach(() => {
  apiGatewayManagementApiMock.reset();
});

test("success", async () => {
  const res = await handler({
    requestContext: {
      connectionId: "connectionId_0",
      domainName: "test.example.com",
      stage: "prod",
      authorizer: { roomId: "roomId_0" },
    },
    body: "test-message",
    isBase64Encoded: false,
  });
  expect(res).toEqual({
    statusCode: 200,
    body: "success",
  });

  const calls = apiGatewayManagementApiMock.commandCalls(
    PostToConnectionCommand
  );
  expect(calls.length).toBe(2);
  expect(calls[0].args[0].input).toEqual({
    ConnectionId: "connectionId_1",
    Data: Buffer.from("test-message"),
  });
  expect(calls[1].args[0].input).toEqual({
    ConnectionId: "connectionId_2",
    Data: Buffer.from("test-message"),
  });
});
