import Connection from "./db/connection";
import { Handler, getConnectionId, getDocId } from "./utils";

export const handler: Handler = async (event) => {
  console.log(JSON.stringify(event, null, 2));

  const connectionId = getConnectionId(event);
  const docId = getDocId(event);

  await Connection.delete({ Key: { pk: docId, sk: connectionId } });

  return { statusCode: 200, body: "Disconnected" };
};
