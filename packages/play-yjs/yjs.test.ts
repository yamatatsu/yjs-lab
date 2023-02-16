import { describe, test, expect } from "vitest";
import * as Y from "yjs";

test("synchronized docs`", () => {
  // GIVEN
  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();
  const arr1 = doc1.getArray("myArray");
  const arr2 = doc2.getArray("myArray");
  doc1.on("update", (update) => Y.applyUpdate(doc2, update));
  doc2.on("update", (update) => Y.applyUpdate(doc1, update));

  // WHEN
  arr1.push(["Hello doc2, you got this?"]);

  // THEN
  expect(arr2.toArray()).toEqual(["Hello doc2, you got this?"]);
});

test("applying update", () => {
  // GIVEN
  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();
  const arr1 = doc1.getArray("myArray");
  const arr2 = doc2.getArray("myArray");
  arr1.push(["Hello doc2, you got this?"]);

  // WHEN
  const update = Y.encodeStateAsUpdate(doc1);
  Y.applyUpdate(doc2, update);

  // THEN
  expect(arr2.toArray()).toEqual(["Hello doc2, you got this?"]);
});

test("use vector", () => {
  // GIVEN
  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();
  const arr1 = doc1.getArray("myArray");
  const arr2 = doc2.getArray("myArray");

  // WHEN
  arr1.push(["first"]);
  const vector2 = Y.encodeStateVector(doc2);
  const diff = Y.encodeStateAsUpdate(doc1, vector2);
  Y.applyUpdate(doc2, diff);

  // THEN
  expect(arr2.toArray()).toEqual(["first"]);
});

test("applying update is commutative", () => {
  // GIVEN
  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();
  const arr1 = doc1.getArray("myArray");
  const arr2 = doc2.getArray("myArray");

  // WHEN
  arr1.push(["first"]);
  const update1 = Y.encodeStateAsUpdate(doc1);
  arr1.insert(0, ["second"]);
  const update2 = Y.encodeStateAsUpdate(doc1);
  Y.applyUpdate(doc2, update2); // update1 and update2 are inverted
  Y.applyUpdate(doc2, update1); // update1 and update2 are inverted

  // THEN
  expect(arr2.toArray()).toEqual(["second", "first"]);
});

test("applying update is idempotent", () => {
  // GIVEN
  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();
  const arr1 = doc1.getArray("myArray");
  const arr2 = doc2.getArray("myArray");
  arr1.push(["Hello doc2, you got this?"]);
  const vector2 = Y.encodeStateVector(doc2);
  const diff = Y.encodeStateAsUpdate(doc1, vector2);

  // WHEN
  Y.applyUpdate(doc2, diff);
  Y.applyUpdate(doc2, diff);

  // THEN
  expect(arr2.toArray()).toEqual(["Hello doc2, you got this?"]);
});

test("confirm size of update, vector and diff", () => {
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

test("confirm v2 size of update, vector and diff", () => {
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

test("confirm how resolve conflict", () => {
  // GIVEN
  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();
  const map1 = doc1.getMap("myMap");
  const map2 = doc2.getMap("myMap");
  map1.set("key_a", "value_a1");
  map2.set("key_a", "value_a2");

  // WHEN
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

  // THEN
  expect(map1.toJSON()).toEqual(map2.toJSON()); // map1 and map2 is always same. But It is not sure that the value is "value_a1" or "value_a2".
});
