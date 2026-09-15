import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { HttpApi, HttpMethod, CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

export class CardGamesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Single-table design. PK = DEVICE#<id>, SK = "PROFILE".
    // On-demand billing keeps this near-free for a personal app.
    const table = new dynamodb.Table(this, "ProfileTable", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      // Keep the data if the stack is torn down — these are user stats.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const profileLogGroup = new logs.LogGroup(this, "ProfileFnLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const profileFn = new lambdaNode.NodejsFunction(this, "ProfileFn", {
      entry: path.join(__dirname, "..", "lambda", "profile.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logGroup: profileLogGroup,
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: {
        minify: true,
        // AWS SDK v3 is provided by the Node 20 Lambda runtime.
        externalModules: ["@aws-sdk/*"],
      },
    });

    table.grantReadWriteData(profileFn);

    const integration = new HttpLambdaIntegration(
      "ProfileIntegration",
      profileFn,
    );

    const api = new HttpApi(this, "CardGamesApi", {
      description: "Card Games profile API",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.PUT,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["content-type", "x-device-id"],
        maxAge: cdk.Duration.days(1),
      },
    });

    api.addRoutes({
      path: "/profile",
      methods: [HttpMethod.GET, HttpMethod.PUT],
      integration,
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.apiEndpoint,
      description:
        "Base URL for VITE_API_BASE_URL (frontend .env). No trailing slash.",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: table.tableName,
    });
  }
}
