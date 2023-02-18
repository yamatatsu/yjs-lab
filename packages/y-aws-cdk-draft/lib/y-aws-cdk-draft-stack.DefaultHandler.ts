import { ApiGatewayManagementApi } from "@aws-sdk/client-apigatewaymanagementapi";
import { DB } from "./db/dynamodb";
import {
  Handler,
  getConnectionId,
  getRoomId,
  getBody,
  getWebsocketEndpoint,
} from "./utils";

export const handler: Handler = async (event) => {
  console.log(JSON.stringify(event, null, 2));

  const senderConnectionId = getConnectionId(event);
  const roomId = getRoomId(event);
  const websocketEndpoint = getWebsocketEndpoint(event);
  const body = getBody(event) ?? "[empty-body]";

  const items = await DB.query({
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": roomId },
  });

  const send = apiGatewayManagementApi(websocketEndpoint);

  await Promise.all(
    items
      .filter((item) => senderConnectionId !== item.connectionId)
      .map(async (item) => {
        try {
          await send(item.connectionId, body);
        } catch (error) {
          console.error(error);
        }
      })
  );

  return { statusCode: 200, body: "success" };
};

function apiGatewayManagementApi(websocketEndpoint: string) {
  const apiGateway = new ApiGatewayManagementApi({
    apiVersion: "2018-11-29",
    endpoint: websocketEndpoint,
  });
  return (connectionId: string, body: string) =>
    apiGateway.postToConnection({
      ConnectionId: connectionId,
      Data: Buffer.from(body),
    });
}
