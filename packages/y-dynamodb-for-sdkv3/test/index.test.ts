// @vitest-environment dynalite

import { test, expect } from "vitest";
import { useDynalite } from "vitest-environment-dynalite";
import * as Y from "yjs";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import DynamoDBPersistence, { PREFERRED_TRIM_SIZE } from "../src";
import YDynamoDBClient from "../src/database";
import * as decoding from "lib0/decoding";

useDynalite();

const tableName = "y-dynamodb";

const dynamoDBClient = new DynamoDBClient({
  ...(process.env.MOCK_DYNAMODB_ENDPOINT && {
    endpoint: process.env.MOCK_DYNAMODB_ENDPOINT,
    sslEnabled: false,
    region: "local",
  }),
});

const ydynamoDBClient = new YDynamoDBClient(dynamoDBClient, tableName);
ydynamoDBClient;

/**
 * Read state vector from Decoder and return as Map. This is a helper method that will be exported by Yjs directly.
 */
const readStateVector = (decoder: decoding.Decoder): Map<number, number> => {
  const ss = new Map();
  const ssLength = decoding.readVarUint(decoder);
  for (let i = 0; i < ssLength; i++) {
    const client = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    ss.set(client, clock);
  }
  return ss;
};

/**
 * Read decodedState and return State as Map.
 */
const decodeStateVector = (decodedState: Uint8Array): Map<number, number> =>
  readStateVector(decoding.createDecoder(decodedState));

/**
 * Flushes all updates to ldb and deletes items from updates array.
 */
const flushUpdatesHelper = (
  ddb: DynamoDBPersistence,
  docName: string,
  updates: Uint8Array[]
) =>
  Promise.all(
    updates.slice(0).map((update) => ddb.storeUpdate(docName, update))
  );
flushUpdatesHelper;

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
wait;

const getAllItems = async () =>
  (await dynamoDBClient.send(new ScanCommand({ TableName: tableName }))).Items;

test("testDynamoDBUpdateStorage", async () => {
  const docName = "testDynamoDBUpdateStorage";
  const ydoc1 = new Y.Doc();
  ydoc1.clientID = 0; // so we can check the state vector
  const persistence = new DynamoDBPersistence(dynamoDBClient, {
    tableName,
  });

  const updates: Uint8Array[] = [];

  ydoc1.on("update", (update: Uint8Array) => {
    updates.push(update);
  });

  ydoc1.getArray("arr").insert(0, [1]);
  ydoc1.getArray("arr").insert(0, [2]);

  await flushUpdatesHelper(persistence, docName, updates);

  const encodedSv = await persistence.getStateVector(docName);
  const sv = decodeStateVector(encodedSv!);
  expect(sv.size).toBe(1);
  expect(sv.get(0)).toBe(2);

  const ydoc2 = await persistence.getYDoc(docName);
  expect(ydoc2?.getArray("arr").toArray()).toEqual([2, 1]);

  expect((await getAllItems())?.length).toBeGreaterThan(0);

  await persistence.clearDocument(docName);

  expect(await getAllItems()).toEqual([]);
});

test(
  "testEncodeManyUpdates",
  async () => {
    const N = PREFERRED_TRIM_SIZE * 7;
    const docName = "testEncodeManyUpdates";
    const ydoc1 = new Y.Doc();
    ydoc1.clientID = 0; // so we can check the state vector
    const persistence = new DynamoDBPersistence(dynamoDBClient, {
      tableName,
    });

    const updates: Uint8Array[] = [];

    ydoc1.on("update", (update) => {
      updates.push(update);
    });

    const yarray = ydoc1.getArray("arr");
    for (let i = 0; i < N; i++) {
      yarray.insert(0, [i]);
    }

    console.time("flushUpdatesHelper()");
    await flushUpdatesHelper(persistence, docName, updates);
    console.timeEnd("flushUpdatesHelper()");

    const ydoc2 = await persistence.getYDoc(docName);
    expect(ydoc2?.getArray("arr")).toHaveLength(N);

    console.time("persistence.flushDocument()");
    await persistence.flushDocument(docName);
    console.timeEnd("persistence.flushDocument()");

    console.time("ydynamoDBClient.getUpdates(docName)");
    const { updates: mergedUpdates } = await ydynamoDBClient.getUpdates(
      docName
    );
    console.timeEnd("ydynamoDBClient.getUpdates(docName)");
    expect(mergedUpdates).toHaveLength(1);

    // getYDoc still works after flush/merge
    console.time("persistence.getYDoc(docName)");
    const ydoc3 = await persistence.getYDoc(docName);
    console.timeEnd("persistence.getYDoc(docName)");
    expect(ydoc3?.getArray("arr")).toHaveLength(N);

    // test if state vector is properly generated
    await expect(persistence.getStateVector(docName)).resolves.toEqual(
      Y.encodeStateVector(ydoc1)
    );

    // add new update so that sv needs to be updated
    ydoc1.getArray("arr").insert(0, ["new"]);
    console.time("flushUpdatesHelper()");
    await flushUpdatesHelper(persistence, docName, updates);
    console.timeEnd("flushUpdatesHelper()");

    console.time("persistence.getStateVector(docName)");
    await expect(persistence.getStateVector(docName)).resolves.toEqual(
      Y.encodeStateVector(ydoc1)
    );
    console.timeEnd("persistence.getStateVector(docName)");
  },
  1000 * 30
);

test(
  "testDiff",
  async () => {
    const N = PREFERRED_TRIM_SIZE * 2; // primes are awesome - ensure that the document is at least flushed once
    const docName = "testDiff";
    const ydoc1 = new Y.Doc();
    ydoc1.clientID = 0; // so we can check the state vector
    const persistence = new DynamoDBPersistence(dynamoDBClient, {
      tableName,
    });

    const updates: Uint8Array[] = [];
    ydoc1.on("update", (update: Uint8Array) => {
      updates.push(update);
    });

    const yarray = ydoc1.getArray("arr");
    // create N changes
    for (let i = 0; i < N; i++) {
      yarray.insert(0, [i]);
    }
    await flushUpdatesHelper(persistence, docName, updates);

    // create partially merged doc
    const ydoc2 = await persistence.getYDoc(docName);

    // another N updates
    for (let i = 0; i < N; i++) {
      yarray.insert(0, [i]);
    }
    await flushUpdatesHelper(persistence, docName, updates);

    // apply diff to doc
    const diffUpdate = await persistence.getDiff(
      docName,
      Y.encodeStateVector(ydoc2!)
    );
    Y.applyUpdate(ydoc2!, diffUpdate!);

    expect(ydoc1.getArray("arr").length).toBe(N * 2);
    expect(ydoc2?.getArray("arr").length).toBe(N * 2);
  },
  1000 * 10
);

test("testMetas", async () => {
  const docName = "testMetas";
  const persistence = new DynamoDBPersistence(dynamoDBClient, {
    tableName,
  });

  await persistence.setMeta(docName, "a", 4);
  await persistence.setMeta(docName, "a", 5);
  await persistence.setMeta(docName, "b", 4);

  const a = await persistence.getMeta(docName, "a");
  const b = await persistence.getMeta(docName, "b");
  expect(a).toBe(5);
  expect(b).toBe(4);

  const metas = await persistence.getMetas(docName);
  expect(metas?.size).toBe(2);
  expect(metas?.get("a")).toBe(5);
  expect(metas?.get("b")).toBe(4);

  await persistence.delMeta(docName, "a");
  const c = await persistence.getMeta(docName, "a");
  expect(c).toBeNull();

  await persistence.clearDocument(docName);
  const metasEmpty = await persistence.getMetas(docName);
  expect(metasEmpty?.size).toBe(0);
});

test("testMisc", async () => {
  const docName = "testMisc";
  const persistence = new DynamoDBPersistence(dynamoDBClient, {
    tableName,
  });

  const sv = await persistence.getStateVector(docName);
  expect(Buffer.from(sv!).byteLength).toBe(1);
});
