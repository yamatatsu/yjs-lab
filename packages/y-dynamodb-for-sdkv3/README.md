# y-dynamodb-for-sdkv3

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

## Prerequisite

Creating a DynamoDB table is required before using `y-dynamodb-for-sdkv3`.

##### AWS CLI

```bash
aws dynamodb create-table \
  --table-name=y-dynamodb \
  --attribute-definitions \
    AttributeName=docName,AttributeType=S \
    AttributeName=sortKey,AttributeType=S \
  --key-schema \
    AttributeName=docName,KeyType=HASH \
    AttributeName=sortKey,KeyType=RANGE \
  --billing-mode=PAY_PER_REQUEST
```

##### AWS CloudFormation

```yaml
Resources:
  myDynamoDBTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: y-dynamodb
      AttributeDefinitions:
        - AttributeName: docName
          AttributeType: S
        - AttributeName: sortKey
          AttributeType: S
      KeySchema:
        - AttributeName: docName
          KeyType: HASH
        - AttributeName: sortKey
          KeyType: RANGE
      BillingMode: PAY_PER_REQUEST
```

##### AWS CDK

```ts
new dynamodb.Table(this, "YDynamodbTable", {
  tableName: "y-dynamodb",
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  partitionKey: { name: "docName", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "sortKey", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});
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

##### getStateVector()

```ts
getStateVector(docName: string): Promise<Uint8Array>
```

The state vector (describing the state of the persisted document - see
[Yjs docs](https://github.com/yjs/yjs#Document-Updates)) is maintained in a separate
field and constantly updated.

This allows you to sync changes without actually creating a Yjs document.

##### getDiff()

```ts
getDiff(docName: string, stateVector: Uint8Array): Promise<Uint8Array>
```

Get the differences directly from the database. The same as
`Y.encodeStateAsUpdate(ydoc, stateVector)`.

##### clearDocument()

```ts
clearDocument(docName: string): Promise<void>
```

Delete a document, and all associated data from the database.

##### flushDocument()

```ts
flushDocument(docName: string): Promise<void>
```

Internally y-dynamodb-for-sdkv3 stores incremental updates. You can merge all document
updates to a single entry. You probably never have to use this.

## Improvements

`y-dynamodb-for-sdkv3` has some improvements from `y-dynamodb`:

- generate unique id without querying to database for conflict-free and improving performance
- use string sort key for readable DynamoDB Table items
- improve the `flushDocument()` procedure for conflict-free

## License

y-dynamodb-for-sdkv3 is licensed under the [MIT License](./LICENSE).
