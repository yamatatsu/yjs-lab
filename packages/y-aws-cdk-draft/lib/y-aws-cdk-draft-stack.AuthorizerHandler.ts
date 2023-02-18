import type { APIGatewayIAMAuthorizerResult } from "aws-lambda";

type Event = { headers: Record<string, string>; methodArn: string };
type Response = Promise<APIGatewayIAMAuthorizerResult | "Unauthorized">;

export const handler = async (event: Event): Response => {
  console.log(JSON.stringify(event, null, 2));

  const token = event.headers.Authorization;
  const roomId = event.headers["Sec-WebSocket-Protocol"];

  if (isUnauthorized(token)) {
    console.info("Unauthorized");
    return "Unauthorized";
  }

  console.info("Authorized");
  return getPolicy(roomId, event.methodArn);
};

// ==============================
// lib

function isUnauthorized(token?: string): boolean {
  return !token || token !== process.env.WEBSOCKET_TOKEN;
}

function getPolicy(
  roomId: string,
  methodArn: string
): APIGatewayIAMAuthorizerResult {
  return {
    principalId: "me",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: methodArn,
        },
      ],
    },
    context: {
      roomId,
    },
  };
}
