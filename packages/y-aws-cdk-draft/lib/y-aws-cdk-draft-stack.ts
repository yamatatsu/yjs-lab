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

    const authorizerHandler = new NodejsFunction(this, "AuthorizerHandler", {
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
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    const disconnectHandler = new NodejsFunction(this, "DisconnectHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    const defaultHandler = new NodejsFunction(this, "DefaultHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    table.grantWriteData(connectHandler);
    table.grantWriteData(disconnectHandler);
    table.grantReadWriteData(defaultHandler);

    const webSocketApi = new apig.WebSocketApi(this, "WebSocketApi", {
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          "ConnectIntegration",
          connectHandler
        ),
        authorizer: new WebSocketLambdaAuthorizer(
          "Authorizer",
          authorizerHandler
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