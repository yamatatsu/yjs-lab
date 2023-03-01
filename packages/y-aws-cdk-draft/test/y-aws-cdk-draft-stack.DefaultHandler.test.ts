process.env.TABLE_NAME = "y-aws-cdk-table";

import { handler } from "../lib/y-aws-cdk-draft-stack.DefaultHandler";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import * as Y from "yjs";
import { mockClient } from "aws-sdk-client-mock";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { toBase64, fromBase64 } from "lib0/buffer";
import { persistence } from "../lib/db/y-doc-persistence";

const apiGatewayManagementApiMock = mockClient(ApiGatewayManagementApiClient);

// protocolMessageType
const messageSync = 0;
// syncMessageType
const messageYjsSyncStep1 = 0;
const messageYjsSyncStep2 = 1;
const messageYjsUpdate = 2;

beforeEach(() => {
  apiGatewayManagementApiMock.reset();
});

const docId = "docId_0";
const subject = (_body: string) =>
  handler({
    requestContext: {
      connectionId: "connectionId_0",
      domainName: "test.example.com",
      stage: "prod",
      authorizer: { docId },
    },
    body: _body,
    isBase64Encoded: false,
  });

describe("sync step1", () => {
  let clientDoc: Y.Doc;
  let body: string;
  beforeEach(async () => {
    // setup the server doc
    const serverDoc = new Y.Doc();
    serverDoc.getMap("myMap").set("key_b", "val_b");
    await persistence.storeUpdate(docId, Y.encodeStateAsUpdate(serverDoc));

    // setup clientDoc
    clientDoc = new Y.Doc();
    clientDoc.getMap("myMap").set("key_a", "val_a");

    // setup body
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, clientDoc);
    body = toBase64(encoding.toUint8Array(encoder));
  });

  test("response of handler", async () => {
    const res = await subject(body);

    expect(res).toEqual({
      statusCode: 200,
      body: "success",
    });
  });

  test("replied data for sync client", async () => {
    await subject(body);

    const calls = apiGatewayManagementApiMock.commandCalls(
      PostToConnectionCommand
    );
    expect(calls).toHaveLength(2);

    // get first reply
    const input = calls[0].args[0].input;
    expect(input).toEqual({
      ConnectionId: "connectionId_0",
      Data: expect.any(Buffer),
    });

    // decode replied data and update clientDoc
    const data = fromBase64(input.Data!.toString());
    const decoder = decoding.createDecoder(data);
    const protocolMessageType = decoding.readVarUint(decoder);
    const syncMessageType = syncProtocol.readSyncMessage(
      decoder,
      encoding.createEncoder(),
      clientDoc,
      {}
    );

    expect(protocolMessageType).toBe(messageSync);
    expect(syncMessageType).toBe(messageYjsSyncStep2);
    expect(clientDoc.getMap("myMap").toJSON()).toEqual({
      key_a: "val_a",
      key_b: "val_b",
    });
  });

  test("replied data for sync server", async () => {
    await subject(body);

    const calls = apiGatewayManagementApiMock.commandCalls(
      PostToConnectionCommand
    );
    expect(calls).toHaveLength(2);

    // get second reply
    const input = calls[1].args[0].input;
    expect(input).toEqual({
      ConnectionId: "connectionId_0",
      Data: expect.any(Buffer),
    });

    // decode replied data
    const data = fromBase64(input.Data!.toString());
    const decoder = decoding.createDecoder(data);
    const protocolMessageType = decoding.readVarUint(decoder);
    const syncMessageType = decoding.readVarUint(decoder);
    const stateVector = decoding.readVarUint8Array(decoder);

    expect(protocolMessageType).toBe(messageSync);
    expect(syncMessageType).toBe(messageYjsSyncStep1);
    const stateVectorOfServerDoc = await persistence.getStateVector(docId);
    expect(stateVector).toEqual(stateVectorOfServerDoc);
  });

  test("the client side update is not stored", async () => {
    await subject(body);

    const serverDoc = await persistence.getYDoc(docId);
    expect(serverDoc?.getMap("myMap").get("key_a")).toBeUndefined();
  });
});

describe("sync step2", () => {
  let clientDoc: Y.Doc;
  let body: string;
  beforeEach(async () => {
    // setup the server doc
    const serverDoc = new Y.Doc();
    serverDoc.getMap("myMap").set("key_b", "val_b");
    await persistence.storeUpdate(docId, Y.encodeStateAsUpdate(serverDoc));

    // setup clientDoc
    clientDoc = new Y.Doc();
    clientDoc.getMap("myMap").set("key_a", "val_a");

    // setup body
    const encoderStep1 = encoding.createEncoder();
    encoding.writeVarUint(encoderStep1, messageSync);
    syncProtocol.writeSyncStep1(encoderStep1, serverDoc);
    const messageStep1 = encoding.toUint8Array(encoderStep1);
    const decoderStep1 = decoding.createDecoder(messageStep1);

    const encoderStep2 = encoding.createEncoder();
    decoding.readVarUint(decoderStep1);
    encoding.writeVarUint(encoderStep2, messageSync);
    syncProtocol.readSyncMessage(decoderStep1, encoderStep2, clientDoc, {});
    body = toBase64(encoding.toUint8Array(encoderStep2));
  });

  test("response of handler", async () => {
    const res = await subject(body);

    expect(res).toEqual({
      statusCode: 200,
      body: "success",
    });
  });

  test("broadcasted datum", async () => {
    await subject(body);

    const calls = apiGatewayManagementApiMock.commandCalls(
      PostToConnectionCommand
    );

    // Two broadcasted datum will be captured.
    expect(calls.length).toBe(2);
    const inputs = calls.map((call) => call.args[0].input);
    expect(inputs[0]).toEqual({
      ConnectionId: "connectionId_1",
      Data: expect.any(Buffer),
    });
    expect(inputs[1]).toEqual({
      ConnectionId: "connectionId_2",
      Data: expect.any(Buffer),
    });

    // These are same
    const [data1, data2] = inputs.map((input) =>
      fromBase64(input.Data!.toString())
    );
    expect(data1).toEqual(data2);

    // decode a broadcasted data
    const observingClientDoc = new Y.Doc();
    const decoder = decoding.createDecoder(data1);
    const protocolMessageType = decoding.readVarUint(decoder);
    const syncMessageType = syncProtocol.readSyncMessage(
      decoder,
      encoding.createEncoder(),
      observingClientDoc,
      {}
    );

    expect(protocolMessageType).toBe(messageSync);
    expect(syncMessageType).toBe(messageYjsSyncStep2);
    expect(observingClientDoc.getMap("myMap").toJSON()).toEqual({
      key_a: "val_a",
    });
  });

  test("storing the update", async () => {
    await subject(body);

    const serverDoc = await persistence.getYDoc(docId);
    expect(serverDoc?.getMap("myMap").toJSON()).toEqual({
      key_a: "val_a",
      key_b: "val_b",
    });
  });
});

describe("update", () => {
  let clientDoc: Y.Doc;
  let body: string;
  beforeEach(async () => {
    // setup the server doc
    const serverDoc = new Y.Doc();
    serverDoc.getMap("myMap").set("key_b", "val_b");
    await persistence.storeUpdate(docId, Y.encodeStateAsUpdate(serverDoc));

    // setup clientDoc and body
    clientDoc = new Y.Doc();
    clientDoc.on("update", (update: Uint8Array) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      body = toBase64(encoding.toUint8Array(encoder));
    });
    clientDoc.getMap("myMap").set("key_a", "val_a");
  });

  test("response of handler", async () => {
    const res = await subject(body);

    expect(res).toEqual({
      statusCode: 200,
      body: "success",
    });
  });

  test("broadcasted datum", async () => {
    await subject(body);

    const calls = apiGatewayManagementApiMock.commandCalls(
      PostToConnectionCommand
    );

    // Two broadcasted datum will be captured.
    expect(calls.length).toBe(2);
    const inputs = calls.map((call) => call.args[0].input);
    expect(inputs[0]).toEqual({
      ConnectionId: "connectionId_1",
      Data: expect.any(Buffer),
    });
    expect(inputs[1]).toEqual({
      ConnectionId: "connectionId_2",
      Data: expect.any(Buffer),
    });

    // These are same
    const [data1, data2] = inputs.map((input) =>
      fromBase64(input.Data!.toString())
    );
    expect(data1).toEqual(data2);

    // decode a broadcasted data
    const observingClientDoc = new Y.Doc();
    const decoder = decoding.createDecoder(data1);
    const protocolMessageType = decoding.readVarUint(decoder);
    const syncMessageType = syncProtocol.readSyncMessage(
      decoder,
      encoding.createEncoder(),
      observingClientDoc,
      {}
    );

    expect(protocolMessageType).toBe(messageSync);
    expect(syncMessageType).toBe(messageYjsUpdate);
    expect(observingClientDoc.getMap("myMap").toJSON()).toEqual({
      key_a: "val_a",
    });
  });

  test("storing the update", async () => {
    await subject(body);

    const serverDoc = await persistence.getYDoc(docId);
    expect(serverDoc?.getMap("myMap").toJSON()).toEqual({
      key_a: "val_a",
      key_b: "val_b",
    });
  });
});
