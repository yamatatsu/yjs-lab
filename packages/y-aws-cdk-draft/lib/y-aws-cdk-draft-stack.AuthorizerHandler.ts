import type { APIGatewayIAMAuthorizerResult } from "aws-lambda";

type Event = { headers: Record<string, string>; methodArn: string };
type Response = Promise<APIGatewayIAMAuthorizerResult | "Unauthorized">;

export const handler = async (event: Event): Response => {
  console.log(JSON.stringify(event, null, 2));

  /**
   * `Sec-WebSocket-Protocol` header is used as the payload for auth token and roomId.
   * Because AWS API Gateway WebSocket API does not support custom path.
   */
  const [token, roomId] = event.headers["Sec-WebSocket-Protocol"].split(",");

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
