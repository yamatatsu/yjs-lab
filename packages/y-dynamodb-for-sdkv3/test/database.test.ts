import * as Y from "yjs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import YDynamoDBClient from "../src/database";

const ddb = new DynamoDBClient({
  ...(process.env.MOCK_DYNAMODB_ENDPOINT && {
    endpoint: process.env.MOCK_DYNAMODB_ENDPOINT,
    sslEnabled: false,
    region: "local",
  }),
});

const tableName = "y-dynamodb";
const docName = "update-storage-doc";
const client = new YDynamoDBClient(ddb, tableName);

describe("stateVector", () => {
  test("put and get", async () => {
    // GIVEN
    const doc = new Y.Doc();
    const sv = Y.encodeStateVector(doc);
    await client.putStateVector(docName, sv, 0);

    // WHEN
    const stateVectorData = await client.getStateVector(docName);

    // THEN
    expect(stateVectorData.sv).toEqual(sv);
    expect(stateVectorData.clock).toBe(0);
  });
});

describe("update", () => {
  test("put and get", async () => {
    // GIVEN
    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on("update", (update: Uint8Array) => {
      updates.push(update);
    });
    doc.getArray("myArray").push(["1st"]);
    doc.getArray("myArray").push(["2nd"]);
    await Promise.all(
      updates.map((update, i) => client.putUpdate(docName, i, update))
    );

    // WHEN
    const storedUpdates = await client.getUpdates(docName);
    const remoteYDoc = new Y.Doc();
    storedUpdates.forEach((update) => {
      Y.applyUpdate(remoteYDoc, update);
    });

    // THEN
    expect(remoteYDoc.getArray("myArray").toJSON()).toEqual(["1st", "2nd"]);
  });

  test("put and delete", async () => {
    // GIVEN
    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on("update", (update: Uint8Array) => {
      updates.push(update);
    });
    // 100 items
    for (let i = 0; i < 100; i++) {
      doc.getArray("myArray").push([i]);
    }
    await Promise.all(
      updates.map((update, i) => client.putUpdate(docName, i, update))
    );

    // WHEN delete 99 items (index 1 ~ 99)
    await client.deleteUpdatesRange(docName, 1, 100);
    const storedUpdates = await client.getUpdates(docName);

    // THEN
    expect(storedUpdates).toHaveLength(1);
  });

  test("getCurrentUpdateClock", async () => {
    // GIVEN
    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on("update", (update: Uint8Array) => {
      updates.push(update);
    });
    // 100 items
    for (let i = 0; i < 100; i++) {
      doc.getArray("myArray").push([i]);
    }
    await Promise.all(
      updates.map((update, i) => client.putUpdate(docName, i, update))
    );

    // WHEN
    const clock = await client.getCurrentUpdateClock(docName);

    // THEN
    expect(clock).toBe(100);
  });
});

describe("meta", () => {
  test("put and get number", async () => {
    // GIVEN
    await client.putMeta(docName, "metaKey_0", 999999);

    // WHEN
    const meta = await client.getMeta(docName, "metaKey_0");

    // THEN
    expect(meta).toBe(999999);
  });

  test("put and get string", async () => {
    // GIVEN
    await client.putMeta(docName, "metaKey_0", "value_0");

    // WHEN
    const meta = await client.getMeta(docName, "metaKey_0");

    // THEN
    expect(meta).toBe("value_0");
  });

  test("put and getMetas", async () => {
    // GIVEN
    await client.putMeta(docName, "metaKey_0", 999999);
    await client.putMeta(docName, "metaKey_1", "value_0");

    // WHEN
    const metas = await client.getMetas(docName);

    // THEN
    const expected = new Map();
    expected.set("metaKey_0", 999999);
    expected.set("metaKey_1", "value_0");
    expect(metas).toEqual(expected);
  });

  test("put and delete", async () => {
    // GIVEN
    await client.putMeta(docName, "metaKey_0", "value_0");
    await client.deleteMeta(docName, "metaKey_0");

    // WHEN
    const meta = await client.getMeta(docName, "metaKey_0");

    // THEN
    expect(meta).toBeNull();
  });
});

describe("document", () => {
  test("delete", async () => {
    // GIVEN
    const doc = new Y.Doc();
    await client.putStateVector(docName, Y.encodeStateVector(doc), 0);
    await client.putUpdate(docName, 0, Y.encodeStateAsUpdate(doc));

    // WHEN
    await client.deleteDocument(docName);
    const stateVectorItem = await client.getStateVector(docName);
    const updateItems = await client.getUpdates(docName);
    const metas = await client.getMetas(docName);

    // THEN
    expect(stateVectorItem).not.toBeNull();
    expect(updateItems).toHaveLength(0);
    expect(metas).toEqual(new Map());
  });
});
