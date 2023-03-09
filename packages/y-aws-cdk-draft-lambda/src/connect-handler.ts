import Connection from "./db/connection";
import { Handler, getConnectionId, getDocId } from "./utils";

export const handler: Handler = async (event) => {
  console.log(JSON.stringify(event, null, 2));

  const connectionId = getConnectionId(event);
  const docId = getDocId(event);

  await Connection.put({
    Item: { pk: docId, sk: connectionId, docId, connectionId },
  });

  return {
    statusCode: 200,
    body: "Connected",
    headers: { "Sec-WebSocket-Protocol": docId },
  };
};
