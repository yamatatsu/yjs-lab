import { DB } from "./db/dynamodb";
import { Handler, getConnectionId, getDocId } from "./utils";

export const handler: Handler = async (event) => {
  console.log(JSON.stringify(event, null, 2));

  const connectionId = getConnectionId(event);
  const docId = getDocId(event);

  await DB.delete({ Key: { pk: docId, sk: connectionId } });

  return { statusCode: 200, body: "Disconnected" };
};
