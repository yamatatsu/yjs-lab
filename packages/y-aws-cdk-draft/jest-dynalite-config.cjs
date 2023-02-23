module.exports = {
  tables: [
    {
      TableName: "y-aws-cdk-table",
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      data: [
        {
          pk: "docId_0",
          sk: "connectionId_0",
          docId: "docId_0",
          connectionId: "connectionId_0",
        },
        {
          pk: "docId_0",
          sk: "connectionId_1",
          docId: "docId_0",
          connectionId: "connectionId_1",
        },
        {
          pk: "docId_0",
          sk: "connectionId_2",
          docId: "docId_0",
          connectionId: "connectionId_2",
        },
        {
          pk: "docId_1",
          sk: "connectionId_2",
          docId: "docId_1",
          connectionId: "connectionId_2",
        },
      ],
    },
  ],
  basePort: 8000,
};
