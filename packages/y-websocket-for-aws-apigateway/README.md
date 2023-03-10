# y-websocket-for-aws-apigateway

DynamoDB database adapter for [Yjs](https://github.com/yjs/yjs) for AWS SDK v3

Rewritten from [y-dynamodb](https://github.com/hesselbom/y-dynamodb/) to use AWS DynamoDB with AWS SDK v3.

## Installation

```sh
npm install y-dynamodb-for-sdkv3 yjs @aws-sdk/client-dynamodb
```

```sh
yarn add y-dynamodb-for-sdkv3 yjs @aws-sdk/client-dynamodb
```

```sh
pnpm add y-dynamodb-for-sdkv3 yjs @aws-sdk/client-dynamodb
```

## Usage

### Basic Usage

You can create an instance of `y-dynamodb-for-sdkv3` as following:

```ts
import DynamoDBPersistence from "y-dynamodb-for-sdkv3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient();
const persistence = new DynamoDBPersistence(client, {
  tableName: "y-dynamodb", // optional, default is 'y-dynamodb'.
});
```

You can store document updates to DynamoDB as following:

```ts
import * as Y from "yjs";

const ydoc = new Y.Doc();
ydoc.getArray("arr").insert(0, [1, 2, 3]);
const update = Y.encodeStateAsUpdate(ydoc);

await persistence.storeUpdate("my-doc", update);
```

You can get the document from DynamoDB as following:

```ts
const ydocPersisted = await persistence.getYDoc("my-doc");
ydocPersisted.getArray("arr").toArray(); // [1, 2, 3]
```

`y-dynamodb-for-sdkv3` is implemented for use in distributed systems such as aws Lambda.
Even when multiple processes save updates to the same document, they do so without conflict.

## Other APIs

#### `persistence.getStateVector(docName: string): Promise<Uint8Array>`

The state vector (describing the state of the persisted document - see
[Yjs docs](https://github.com/yjs/yjs#Document-Updates)) is maintained in a separate
field and constantly updated.

This allows you to sync changes without actually creating a Yjs document.

#### `persistence.getDiff(docName: string, stateVector: Uint8Array): Promise<Uint8Array>`

Get the differences directly from the database. The same as
`Y.encodeStateAsUpdate(ydoc, stateVector)`.

#### `persistence.clearDocument(docName: string): Promise<void>`

Delete a document, and all associated data from the database.

#### `persistence.setMeta(docName: string, metaKey: string, value: any): Promise<void>`

Persist some meta information in the database and associate it with a document.
It is up to you what you store here.

#### `persistence.getMeta(docName: string, metaKey: string): Promise<any|undefined>`

Retrieve a store meta value from the database. Returns undefined if the
`metaKey` doesn't exist.

#### `persistence.delMeta(docName: string, metaKey: string): Promise<void>`

Delete a store meta value.

#### `persistence.flushDocument(docName: string): Promise<void>` (dev only)

Internally y-dynamodb-for-sdkv3 stores incremental updates. You can merge all document
updates to a single entry. You probably never have to use this.

## Improvements

- use atomic counter for conflict-free and improving performance
- use string sort key for readable DynamoDB Table items
- improve the `flushDocument()` procedure for conflict-free

## License

y-dynamodb-for-sdkv3 is licensed under the [MIT License](./LICENSE).
