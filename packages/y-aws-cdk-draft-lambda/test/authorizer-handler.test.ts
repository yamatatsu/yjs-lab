// @vitest-environment dynalite

process.env.WEBSOCKET_TOKEN = "test-WEBSOCKET_TOKEN";

import { test, expect } from "vitest";
import { useDynalite } from "vitest-environment-dynalite";
import { handler } from "../src/authorizer-handler";

useDynalite();

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
    docId: "test-docId",
  },
}}
`("authorized", async ({ authorizationHeader, expected }) => {
  const res = await handler({
    headers: {
      "Sec-WebSocket-Protocol": `${authorizationHeader},test-docId`,
    },
    methodArn: "test-methodArnArn",
  });
  expect(res).toEqual(expected);
});
