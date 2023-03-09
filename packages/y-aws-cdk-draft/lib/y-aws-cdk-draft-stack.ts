import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apig from "@aws-cdk/aws-apigatewayv2-alpha";
import { WebSocketLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { WebSocketLambdaAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";

export class WebSocketApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, "Table", {
      tableName: "y-aws-cdk-table",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
    });
    const yDynamodbTable = new dynamodb.Table(this, "YDynamodbTable", {
      tableName: "y-dynamodb",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: { name: "docName", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sortKey", type: dynamodb.AttributeType.STRING },
    });

    const authorizerHandler = new NodejsFunction(this, "AuthorizerHandler", {
      entry: "../y-aws-cdk-draft-lambda/src/authorizer-handler.ts",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        WEBSOCKET_TOKEN: ssm.StringParameter.fromStringParameterName(
          this,
          "WEBSOCKET_TOKEN",
          "/y-aws-cdk/websocket-token"
        ).stringValue,
      },
    });
    const connectHandler = new NodejsFunction(this, "ConnectHandler", {
      entry: "../y-aws-cdk-draft-lambda/src/connect-handler.ts",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    const disconnectHandler = new NodejsFunction(this, "DisconnectHandler", {
      entry: "../y-aws-cdk-draft-lambda/src/disconnect-handler.ts",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    const defaultHandler = new NodejsFunction(this, "DefaultHandler", {
      entry: "../y-aws-cdk-draft-lambda/src/default-handler.ts",
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    table.grantWriteData(connectHandler);
    table.grantWriteData(disconnectHandler);
    table.grantReadData(defaultHandler);
    yDynamodbTable.grantReadWriteData(connectHandler);
    yDynamodbTable.grantReadWriteData(defaultHandler);

    const webSocketApi = new apig.WebSocketApi(this, "WebSocketApi", {
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          "ConnectIntegration",
          connectHandler
        ),
        authorizer: new WebSocketLambdaAuthorizer(
          "Authorizer",
          authorizerHandler,
          // use `Sec-WebSocket-Protocol` header for auth, because `WebSocket` class cannot set `Authorization` request header
          { identitySource: ["route.request.header.Sec-WebSocket-Protocol"] }
        ),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          "DisconnectIntegration",
          disconnectHandler
        ),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          "DefaultIntegration",
          defaultHandler
        ),
      },
    });

    new apig.WebSocketStage(this, "WebSocketStage", {
      webSocketApi,
      stageName: "dev",
      autoDeploy: true,
    });

    webSocketApi.grantManageConnections(defaultHandler);
  }
}
