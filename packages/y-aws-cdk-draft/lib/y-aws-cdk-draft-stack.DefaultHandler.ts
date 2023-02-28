import * as Y from "yjs";
import { persistence } from "./db/y-doc-persistence";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { toBase64, fromBase64 } from "lib0/buffer";
import Connection from "./db/connection";
import WebsocketApiClient from "./WebsocketApiClient";
import {
  Handler,
  getConnectionId,
  getDocId,
  getBody,
  getWebsocketEndpoint,
} from "./utils";

/**
 * transactionOrigin is just a object.
 * Because in a Lambda instance, requested process is always isolated.
 */
const transactionOrigin = {};
const messageSync = 0;
const messageAwareness = 1;
const messageYjsSyncStep1 = 0;
const messageYjsSyncStep2 = 1;
const messageYjsUpdate = 2;

export const handler: Handler = async (event) => {
  console.log(JSON.stringify(event, null, 2));

  const docId = getDocId(event);
  const body = getBody(event) ?? "[empty-body]";

  const wsClient = new WebsocketApiClient(getWebsocketEndpoint(event));

  const decoder = decoding.createDecoder(fromBase64(body));

  /**
   * If use `syncProtocol.readSyncMessage()` that is a sync-protocol high level feature,
   * it is needed to get a doc with `persistence.getYDoc()` every `persistence.storeUpdate()` also.
   * That could cause high bills because `persistence.getYDoc()` reads all of stored updates.
   */
  switch (readMessageType(decoder)) {
    case "syncStep1": {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      const doc = (await persistence.getYDoc(docId)) ?? new Y.Doc();

      syncProtocol.readSyncStep1(decoder, encoder, doc);
      await wsClient.reply(
        toBase64(encoding.toUint8Array(encoder)),
        getConnectionId(event)
      );
      break;
    }
    case "syncStep2":
    case "update": {
      const update = decoding.readVarUint8Array(decoder);
      await persistence.storeUpdate(docId, update);

      const items = await Connection.query({
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": docId },
      });
      await wsClient.broadcast(
        body,
        getConnectionId(event),
        items.map((item) => item.connectionId)
      );
      break;
    }
    case "awareness": {
      awarenessProtocol.applyAwarenessUpdate(
        new awarenessProtocol.Awareness(new Y.Doc()),
        decoding.readVarUint8Array(decoder),
        transactionOrigin
      );
      break;
    }
  }

  return { statusCode: 200, body: "success" };
};

const readMessageType = (decoder: decoding.Decoder) => {
  switch (decoding.readVarUint(decoder)) {
    case messageSync: {
      switch (decoding.readVarUint(decoder)) {
        case messageYjsSyncStep1:
          return "syncStep1";
        case messageYjsSyncStep2:
          return "syncStep2";
        case messageYjsUpdate:
          return "update";
      }
    }
    case messageAwareness: {
      return "awareness";
    }
  }
  throw new Error("Unknown message type");
};
