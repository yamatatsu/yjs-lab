import { config } from "dotenv";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "./y-websocket";

config();

const doc1 = new Y.Doc();
const doc2 = new Y.Doc();

const promiseDoc1Synced = observeDoc("doc1", doc1, [
  "key_a",
  "key_b",
  "key_c",
  "key_d",
]);
const promiseDoc2Synced = observeDoc("doc2", doc2, [
  "key_a",
  "key_b",
  "key_c",
  "key_d",
]);

const map1 = doc1.getMap("myMap");
const map2 = doc2.getMap("myMap");
map1.set("key_a", "value_a1");
map2.set("key_b", "value_b1");

const client1 = createWebsocketProvider(doc1);
const client2 = createWebsocketProvider(doc2);

client1.ws?.addEventListener("open", () => {
  if (client2.wsconnected) {
    map1.set("key_c", "value_c1");
    map2.set("key_d", "value_d1");
  }
});
client2.ws?.addEventListener("open", () => {
  if (client1.wsconnected) {
    map1.set("key_c", "value_c1");
    map2.set("key_d", "value_d1");
  }
});

await Promise.all([promiseDoc1Synced, promiseDoc2Synced]);

console.log("done to collaborate doc1 and doc2");
client1.destroy();
client2.destroy();

const doc3 = new Y.Doc();
const promiseDoc3Synced = observeDoc("doc3", doc3, [
  "key_a",
  "key_b",
  "key_c",
  "key_d",
  "key_e",
]);

const map3 = doc3.getMap("myMap");
map3.set("key_e", "value_e1");

const client3 = createWebsocketProvider(doc3);

await promiseDoc3Synced;
client3.destroy();

// ======================
// lib

function observeDoc(name: string, doc: Y.Doc, keysForComplete: string[]) {
  const map = doc.getMap("myMap");
  return new Promise<void>((resolve) => {
    doc.on("update", () => {
      const mapJson = map.toJSON();
      console.log(name + ":", mapJson);
      if (keysForComplete.every((key) => !!mapJson[key])) {
        resolve();
      }
    });
  });
}

function createWebsocketProvider(doc: Y.Doc) {
  const url = "wss://ijxmnnebka.execute-api.ap-northeast-1.amazonaws.com/dev/";
  const token = process.env.WEBSOCKET_TOKEN!;
  const docId = "doc_0";
  return new WebsocketProvider(url, docId, doc, {
    // @ts-expect-error
    WebSocketPolyfill: WebSocket,
    subprotocols: [token],
    disableBc: true,
  });
}
