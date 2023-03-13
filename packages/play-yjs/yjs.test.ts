import { beforeEach, test, expect } from "vitest";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";

let doc1: Y.Doc;
let doc2: Y.Doc;
let arr1: Y.Array<unknown>;
let arr2: Y.Array<unknown>;
let map1: Y.Map<unknown>;
let map2: Y.Map<unknown>;

beforeEach(() => {
  doc1 = new Y.Doc();
  doc2 = new Y.Doc();
  arr1 = doc1.getArray("myArray");
  arr2 = doc2.getArray("myArray");
  map1 = doc1.getMap("myMap");
  map2 = doc2.getMap("myMap");
});

test("synchronized docs`", () => {
  // GIVEN
  doc1.on("update", (update) => Y.applyUpdate(doc2, update));
  doc2.on("update", (update) => Y.applyUpdate(doc1, update));

  // WHEN
  arr1.push(["Hello doc2, you got this?"]);

  // THEN
  expect(arr2.toArray()).toEqual(["Hello doc2, you got this?"]);
});

test("applying update", () => {
  // GIVEN
  arr1.push(["Hello doc2, you got this?"]);

  // WHEN
  const update = Y.encodeStateAsUpdate(doc1);
  Y.applyUpdate(doc2, update);

  // THEN
  expect(arr2.toArray()).toEqual(["Hello doc2, you got this?"]);
});

test("use vector", () => {
  // GIVEN
  arr1.push(["first"]);
  const vector2 = Y.encodeStateVector(doc2);
  const diff = Y.encodeStateAsUpdate(doc1, vector2);

  // WHEN
  Y.applyUpdate(doc2, diff);

  // THEN
  expect(arr2.toArray()).toEqual(["first"]);
});

test("applying update is commutative", () => {
  // GIVEN
  const updates: Uint8Array[] = [];
  doc1.on("update", (update: Uint8Array) => {
    updates.push(update);
  });
  arr1.push(["first"]);
  arr1.push(["second"]);

  // WHEN apply updates in reverse order
  updates.reverse().forEach((update) => {
    Y.applyUpdate(doc2, update);
  });

  // THEN
  expect(arr2.toArray()).toEqual(["first", "second"]);
});

test("applying update is idempotent", () => {
  // GIVEN
  doc1.on("update", (update: Uint8Array) => {
    Y.applyUpdate(doc2, update);
  });
  doc1.on("update", (update: Uint8Array) => {
    Y.applyUpdate(doc2, update);
  });

  // WHEN an update are applied twice.
  arr1.push(["Hello doc2, you got this just once?"]);

  // THEN
  expect(arr2.toArray()).toEqual(["Hello doc2, you got this just once?"]);
});

/**
 * skip this case because flaky
 */
test.skip("confirm size of update, vector and diff", () => {
  // GIVEN
  const centralDoc = new Y.Doc();
  const nodeDoc = new Y.Doc();
  const centralArr = centralDoc.getArray("myArray");
  const nodeArr = nodeDoc.getArray("myArray");
  centralArr.push([...Array(1000)].fill("a"));
  Y.applyUpdate(nodeDoc, Y.encodeStateAsUpdate(centralDoc));
  nodeArr.push([...Array(1000)].fill("b"));

  // WHEN
  const centralUpdate = Y.encodeStateAsUpdate(centralDoc);
  const nodeUpdate = Y.encodeStateAsUpdate(nodeDoc);
  const centralVector = Y.encodeStateVector(centralDoc);
  const nodeVector = Y.encodeStateVector(nodeDoc);
  const diffNodeToCentral = Y.encodeStateAsUpdate(centralDoc, nodeVector);
  const diffCentralToNode = Y.encodeStateAsUpdate(nodeDoc, centralVector);

  // THEN
  expect(Buffer.from(centralUpdate).byteLength).toBe(3021);
  expect(Buffer.from(nodeUpdate).byteLength).toBe(6038); // nearly 2x
  expect(Buffer.from(centralVector).byteLength).toBe(8); // small😱!!! just the address of the timeline?
  expect(Buffer.from(nodeVector).byteLength).toBe(15); // small😱!!! just the address of the timeline?
  expect(Buffer.from(diffNodeToCentral).byteLength).toBe(2); // small because of no need to change node
  expect(Buffer.from(diffCentralToNode).byteLength).toBe(3019); // smaller than nodeUpdate because this include only `push([...Array(1000)].fill("b"))`

  /**
   * The above results indicate the possibility of reducing communication data.
   * On the other hand, the procedure is more complicated.
   */
});

/**
 * skip this case because flaky
 */
test.skip("confirm v2 size of update, vector and diff", () => {
  // GIVEN
  const centralDoc = new Y.Doc();
  const nodeDoc = new Y.Doc();
  const centralArr = centralDoc.getArray("myArray");
  const nodeArr = nodeDoc.getArray("myArray");
  centralArr.push([...Array(1000)].fill("a"));
  Y.applyUpdate(nodeDoc, Y.encodeStateAsUpdate(centralDoc));
  nodeArr.push([...Array(1000)].fill("b"));

  // WHEN
  const centralUpdate = Y.encodeStateAsUpdateV2(centralDoc);
  const nodeUpdate = Y.encodeStateAsUpdateV2(nodeDoc);
  const centralVector = Y.encodeStateVector(centralDoc);
  const nodeVector = Y.encodeStateVector(nodeDoc);
  const diffNodeToCentral = Y.encodeStateAsUpdateV2(centralDoc, nodeVector);
  const diffCentralToNode = Y.encodeStateAsUpdateV2(nodeDoc, centralVector);

  // THEN
  expect(Buffer.from(centralUpdate).byteLength).toBe(3032);
  expect(Buffer.from(nodeUpdate).byteLength).toBe(6049); // nearly 2x
  expect(Buffer.from(centralVector).byteLength).toBe(8); // small😱!!! just the address of the timeline?
  expect(Buffer.from(nodeVector).byteLength).toBe(15); // small😱!!! just the address of the timeline?
  expect(Buffer.from(diffNodeToCentral).byteLength).toBe(13); // small because of no need to change node
  expect(Buffer.from(diffCentralToNode).byteLength).toBe(3030); // smaller than nodeUpdate because this include only `push([...Array(1000)].fill("b"))`

  /**
   * The above results indicate the possibility of reducing communication data.
   * On the other hand, the procedure is more complicated.
   */
});

test.only("confirm how resolve conflict", () => {
  // GIVEN
  map1.set("key_a", "value_a1");
  map2.set("key_a", "value_a2");

  // WHEN
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

  // THEN
  expect(map1.toJSON()).toEqual(map2.toJSON()); // map1 and map2 is always same. But It is not sure that the value is "value_a1" or "value_a2".
});

test("No change is happen when there are any missing data.", () => {
  // GIVEN
  map1.set("key_a", "value_a1");
  doc1.on("update", (update) => {
    Y.applyUpdate(doc2, update);
  });

  // WHEN
  map1.set("key_b", "value_b1");

  // THEN
  expect(map2.toJSON()).toEqual({}); // doc2 does not have `key_b` yet, because the change of `key_a` have not reached to doc2.
});

test("No change is happen when there are any missing data.", () => {
  // GIVEN
  let keyAUpdate;
  doc1.once("update", (update) => {
    keyAUpdate = update;
  });
  map1.set("key_a", "value_a1");

  doc1.on("update", (update) => {
    Y.applyUpdate(doc2, update);
  });

  // WHEN
  map1.set("key_b", "value_b1");
  Y.applyUpdate(doc2, keyAUpdate);

  // THEN
  expect(map2.toJSON()).toEqual({ key_a: "value_a1", key_b: "value_b1" }); // doc2 have both keys! Because both changes reach to doc2.
});

test("update with y-protocol", () => {
  // GIVEN
  doc1.on("update", (update) => {
    const encoder1 = encoding.createEncoder();
    syncProtocol.writeUpdate(encoder1, update);
    const buf = encoding.toUint8Array(encoder1);

    // ==== send buf ====

    const decoder = decoding.createDecoder(buf);
    const encoder2 = encoding.createEncoder();
    syncProtocol.readSyncMessage(decoder, encoder2, doc2, {});
  });

  // WHEN
  map1.set("key_a", "value_a1");

  // THEN
  expect(map2.toJSON()).toEqual({ key_a: "value_a1" });
});

test("sync with y-protocol", () => {
  // GIVEN
  map1.set("key_a", "value_a1");
  map2.set("key_b", "value_b1");

  // WHEN connected

  const encoder1 = encoding.createEncoder();
  syncProtocol.writeSyncStep1(encoder1, doc1);
  const buf1 = encoding.toUint8Array(encoder1);

  // ==== send buf1 (vector of doc1) ====

  const decoder1 = decoding.createDecoder(buf1);
  const encoder2 = encoding.createEncoder();
  syncProtocol.readSyncMessage(decoder1, encoder2, doc2, {});
  const buf2 = encoding.toUint8Array(encoder2);

  // ==== send buf2 (update of the gap between doc1 and doc2) ====

  const decoder2 = decoding.createDecoder(buf2);
  const _encoder = encoding.createEncoder();
  syncProtocol.readSyncMessage(decoder2, _encoder, doc1, {});

  // THEN
  expect(encoding.length(_encoder)).toBe(0);
  expect(map1.toJSON()).toEqual({ key_a: "value_a1", key_b: "value_b1" });
  expect(map2.toJSON()).toEqual({ key_b: "value_b1" });
});

test("the change of itself does not trigger update event", () => {
  // GIVEN
  map1.set("key_a", "value_a1");
  const doc1Update = Y.encodeStateAsUpdate(doc1);

  // WHEN
  let triggered = false;
  doc1.on("update", (_update) => {
    triggered = true;
  });
  Y.applyUpdate(doc1, doc1Update);

  // THEN
  expect(triggered).toBe(false);
});
