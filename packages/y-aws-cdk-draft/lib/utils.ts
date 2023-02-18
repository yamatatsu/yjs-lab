import type {
  APIGatewayProxyWebsocketEventV2WithRequestContext,
  APIGatewayEventWebsocketRequestContextV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";

type RequestContext = Pick<
  APIGatewayEventWebsocketRequestContextV2,
  "connectionId" | "domainName" | "stage"
> & { authorizer: { roomId: string } };

type Event = APIGatewayProxyWebsocketEventV2WithRequestContext<RequestContext>;
type Response = Promise<APIGatewayProxyResultV2<never>>;

export type Handler = (event: Event) => Response;

export function getRoomId(event: Event) {
  return event.requestContext.authorizer.roomId;
}
export function getConnectionId(event: Event) {
  return event.requestContext.connectionId;
}
export function getBody(event: Event) {
  return event.body;
}
export function getWebsocketEndpoint(event: Event) {
  const { domainName, stage } = event.requestContext;
  return `https://${domainName}/${stage}`;
}
