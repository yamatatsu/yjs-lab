import { ApiGatewayManagementApi } from "@aws-sdk/client-apigatewaymanagementapi";

export default class WebsocketApiClient {
  private readonly apiGatewayManagementApi: ApiGatewayManagementApi;
  constructor(websocketEndpoint: string) {
    this.apiGatewayManagementApi = new ApiGatewayManagementApi({
      apiVersion: "2018-11-29",
      endpoint: websocketEndpoint,
    });
  }

  async broadcast(
    message: string,
    senderConnectionId: string,
    connectionIds: string[]
  ) {
    await Promise.all(
      connectionIds
        .filter((connectionId) => senderConnectionId !== connectionId)
        .map(async (connectionId) => {
          try {
            await this.send(connectionId, message);
          } catch (error) {
            console.error(error);
          }
        })
    );
  }

  async reply(message: string, senderConnectionId: string) {
    await this.send(senderConnectionId, message);
  }

  private async send(connectionId: string, message: string): Promise<void> {
    await this.apiGatewayManagementApi.postToConnection({
      ConnectionId: connectionId,
      Data: Buffer.from(message),
    });
  }
}
