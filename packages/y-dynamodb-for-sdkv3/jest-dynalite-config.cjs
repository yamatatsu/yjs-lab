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
        { AttributeName: "ykeysort", AttributeType: "B" },
      ],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      // data: [
      //   {
      //     ydocname: "ydocname_0",
      //     ykeysort: "connectionId_0",
      //   },
      // ],
    },
  ],
  basePort: 8000,
};
