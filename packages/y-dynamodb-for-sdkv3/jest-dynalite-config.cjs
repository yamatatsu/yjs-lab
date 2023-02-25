module.exports = {
  tables: [
    {
      TableName: "y-dynamodb",
      KeySchema: [
        { AttributeName: "ydocname", KeyType: "HASH" },
        { AttributeName: "ykeysort", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "ydocname", AttributeType: "S" },
        { AttributeName: "ykeysort", AttributeType: "S" },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    },
  ],
  basePort: 8000,
};
