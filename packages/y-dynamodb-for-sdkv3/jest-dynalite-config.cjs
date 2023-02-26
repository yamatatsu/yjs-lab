module.exports = {
  tables: [
    {
      TableName: "y-dynamodb",
      KeySchema: [
        { AttributeName: "docName", KeyType: "HASH" },
        { AttributeName: "sortKey", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "docName", AttributeType: "S" },
        { AttributeName: "sortKey", AttributeType: "S" },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  ],
  basePort: 8000,
};
