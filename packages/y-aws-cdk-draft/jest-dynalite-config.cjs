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
          pk: "roomId_0",
          sk: "connectionId_0",
          roomId: "roomId_0",
          connectionId: "connectionId_0",
        },
        {
          pk: "roomId_0",
          sk: "connectionId_1",
          roomId: "roomId_0",
          connectionId: "connectionId_1",
        },
        {
          pk: "roomId_0",
          sk: "connectionId_2",
          roomId: "roomId_0",
          connectionId: "connectionId_2",
        },
        {
          pk: "roomId_1",
          sk: "connectionId_2",
          roomId: "roomId_1",
          connectionId: "connectionId_2",
        },
      ],
    },
  ],
  basePort: 8000,
};
