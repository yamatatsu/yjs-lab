import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { WebSocketApiStack } from "../lib/y-aws-cdk-draft-stack";

test("Snapshot test", () => {
  const app = new cdk.App();
  const stack = new WebSocketApiStack(app, "Target");

  cdk.Aspects.of(stack).add({
    visit(construct) {
      if (
        construct instanceof lambda.CfnFunction &&
        "s3Key" in construct.code
      ) {
        construct.code = { s3Key: "dummy.zip" };
      }
    },
  });

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
