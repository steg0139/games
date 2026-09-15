#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CardGamesStack } from "../lib/card-games-stack";
import { HostingStack } from "../lib/hosting-stack";

const app = new cdk.App();

// Region is fixed to us-east-2 per project decision, but account comes from
// the ambient CDK/AWS environment so this deploys to whatever account you're
// authenticated against.
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-2",
};

new CardGamesStack(app, "CardGamesStack", {
  env,
  description: "Card Games PWA — profile stats backup (DynamoDB + HTTP API).",
});

new HostingStack(app, "CardGamesHostingStack", {
  env,
  description: "Card Games PWA — static hosting (S3 + CloudFront).",
});
