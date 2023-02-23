import { config } from "dotenv";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "./y-websocket";

config();

const url = "wss://ijxmnnebka.execute-api.ap-northeast-1.amazonaws.com/dev/";
const token = process.env.WEBSOCKET_TOKEN!;
const docId = "doc_0";

const doc1 = new Y.Doc();
const doc2 = new Y.Doc();
const map1 = doc1.getMap("myMap");
const map2 = doc2.getMap("myMap");
map1.set("key_a", "value_a1");
map2.set("key_b", "value_b1");

const client1 = new WebsocketProvider(url, docId, doc1, {
  // @ts-expect-error
  WebSocketPolyfill: WebSocket,
  subprotocols: [token],
});
const client2 = new WebsocketProvider(url, docId, doc2, {
  // @ts-expect-error
  WebSocketPolyfill: WebSocket,
  subprotocols: [token],
});

doc1.on("afterTransaction", () => {
  console.log("map1:", map1.toJSON());
});
doc2.on("afterTransaction", () => {
  console.log("map2:", map2.toJSON());
});

client1.on("synced", () => {
  if (client2.wsconnected) {
    map1.set("key_c", "value_c1");
  }
});

client2.on("synced", () => {
  if (client1.wsconnected) {
    map2.set("key_d", "value_d1");
  }
});
