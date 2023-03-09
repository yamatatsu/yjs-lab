// @vitest-environment dynalite

import { describe, test, expect } from "vitest";
import { useDynalite } from "vitest-environment-dynalite";
import * as Y from "yjs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import YDynamoDBClient from "../src/database";

useDynalite();

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
      updates.map((update) => client.putUpdate(docName, new Date(), update))
    );

    // WHEN
    const { updates: storedUpdates } = await client.getUpdates(docName);
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
      updates.map((update) => client.putUpdate(docName, new Date(), update))
    );

    // WHEN
    const { deleteUpdates } = await client.getUpdates(docName);
    await deleteUpdates();
    const { updates: storedUpdates } = await client.getUpdates(docName);

    // THEN
    expect(storedUpdates).toHaveLength(0);
  });
});

describe("document", () => {
  test("delete", async () => {
    // GIVEN
    const doc = new Y.Doc();
    await client.putUpdate(docName, new Date(), Y.encodeStateAsUpdate(doc));

    // WHEN
    await client.deleteDocument(docName);
    const { updates: updateItems } = await client.getUpdates(docName);

    // THEN
    expect(updateItems).toHaveLength(0);
  });
});
