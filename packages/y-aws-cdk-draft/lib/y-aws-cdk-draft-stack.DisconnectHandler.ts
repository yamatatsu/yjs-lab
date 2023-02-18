import { DB } from "./db/dynamodb";
import { Handler, getConnectionId, getRoomId } from "./utils";

export const handler: Handler = async (event) => {
  console.log(JSON.stringify(event, null, 2));

  const connectionId = getConnectionId(event);
  const roomId = getRoomId(event);

  await DB.delete({ Key: { pk: roomId, sk: connectionId } });

  return { statusCode: 200, body: "Disconnected" };
};
