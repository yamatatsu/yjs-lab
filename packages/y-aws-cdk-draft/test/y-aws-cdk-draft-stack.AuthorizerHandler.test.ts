process.env.WEBSOCKET_TOKEN = "test-WEBSOCKET_TOKEN";

import { handler } from "../lib/y-aws-cdk-draft-stack.AuthorizerHandler";

test.each`
  authorizationHeader | expected
  ${undefined}        | ${"Unauthorized"}
  ${"dummy"}          | ${"Unauthorized"}
  ${"test-WEBSOCKET_TOKEN"} | ${{
  principalId: "me",
  policyDocument: {
    Version: "2012-10-17",
    Statement: [{ Action: "execute-api:Invoke", Effect: "Allow", Resource: "test-methodArnArn" }],
  },
  context: {
    roomId: "test-roomId",
  },
}}
`("authorized", async ({ authorizationHeader, expected }) => {
  const res = await handler({
    headers: {
      "Sec-WebSocket-Protocol": "test-roomId",
      Authorization: authorizationHeader,
    },
    methodArn: "test-methodArnArn",
  });
  expect(res).toEqual(expected);
});
