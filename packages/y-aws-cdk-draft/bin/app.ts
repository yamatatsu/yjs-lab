import * as cdk from "aws-cdk-lib";
import { WebSocketApiStack } from "../lib/y-aws-cdk-draft-stack";

const app = new cdk.App();
new WebSocketApiStack(app, "YAwsCdk", {});
