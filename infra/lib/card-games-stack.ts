import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
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
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["content-type", "x-device-id"],
        maxAge: cdk.Duration.days(1),
      },
    });

    api.addRoutes({
      path: "/profile",
      methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
      integration,
    });

    // --- Daily crossword: generator Lambda + nightly cron + read routes -----
    const crosswordLogGroup = new logs.LogGroup(this, "CrosswordFnLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const crosswordFn = new lambdaNode.NodejsFunction(this, "CrosswordFn", {
      entry: path.join(__dirname, "..", "lambda", "crossword.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512, // layout generation is a little CPU-heavy
      timeout: cdk.Duration.seconds(15),
      logGroup: crosswordLogGroup,
      environment: { TABLE_NAME: table.tableName },
      bundling: {
        minify: true,
        externalModules: ["@aws-sdk/*"],
        // The layout generator + word pool must be bundled, not externalized.
        loader: { ".json": "json" },
      },
    });
    table.grantReadWriteData(crosswordFn);

    const crosswordIntegration = new HttpLambdaIntegration(
      "CrosswordIntegration",
      crosswordFn,
    );
    api.addRoutes({
      path: "/crossword/today",
      methods: [HttpMethod.GET],
      integration: crosswordIntegration,
    });
    api.addRoutes({
      path: "/crossword/random",
      methods: [HttpMethod.GET],
      integration: crosswordIntegration,
    });

    // Nightly cron pre-generates the day's canonical puzzle so the first
    // visitor gets a cache hit. Invokes the `scheduled` export. The daily rolls
    // over at midnight America/Chicago; EventBridge cron is UTC-only and does
    // not track DST, so we fire shortly after both possible Central midnights
    // (05:10 UTC in CDT, 06:10 UTC in CST). Generation is idempotent — whichever
    // run happens after the local rollover creates the puzzle; the other is a
    // no-op read — so running at both times is safe.
    const crosswordCronFn = new lambdaNode.NodejsFunction(this, "CrosswordCronFn", {
      entry: path.join(__dirname, "..", "lambda", "crossword.ts"),
      handler: "scheduled",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logGroup: crosswordLogGroup,
      environment: { TABLE_NAME: table.tableName },
      bundling: {
        minify: true,
        externalModules: ["@aws-sdk/*"],
        loader: { ".json": "json" },
      },
    });
    table.grantReadWriteData(crosswordCronFn);

    // 05:10 UTC = 00:10 CDT (summer); 06:10 UTC = 00:10 CST (winter).
    new events.Rule(this, "CrosswordDailyRule", {
      schedule: events.Schedule.cron({ minute: "10", hour: "5,6" }),
      targets: [new targets.LambdaFunction(crosswordCronFn)],
    });

    // --- Daily Sudoku: generator Lambda + nightly cron + read routes --------
    const sudokuLogGroup = new logs.LogGroup(this, "SudokuFnLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const sudokuFn = new lambdaNode.NodejsFunction(this, "SudokuFn", {
      entry: path.join(__dirname, "..", "lambda", "sudoku.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512, // backtracking + uniqueness check
      timeout: cdk.Duration.seconds(15),
      logGroup: sudokuLogGroup,
      environment: { TABLE_NAME: table.tableName },
      bundling: { minify: true, externalModules: ["@aws-sdk/*"] },
    });
    table.grantReadWriteData(sudokuFn);

    const sudokuIntegration = new HttpLambdaIntegration(
      "SudokuIntegration",
      sudokuFn,
    );
    api.addRoutes({
      path: "/sudoku/today",
      methods: [HttpMethod.GET],
      integration: sudokuIntegration,
    });
    api.addRoutes({
      path: "/sudoku/random",
      methods: [HttpMethod.GET],
      integration: sudokuIntegration,
    });

    const sudokuCronFn = new lambdaNode.NodejsFunction(this, "SudokuCronFn", {
      entry: path.join(__dirname, "..", "lambda", "sudoku.ts"),
      handler: "scheduled",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logGroup: sudokuLogGroup,
      environment: { TABLE_NAME: table.tableName },
      bundling: { minify: true, externalModules: ["@aws-sdk/*"] },
    });
    table.grantReadWriteData(sudokuCronFn);

    new events.Rule(this, "SudokuDailyRule", {
      schedule: events.Schedule.cron({ minute: "10", hour: "5,6" }),
      targets: [new targets.LambdaFunction(sudokuCronFn)],
    });

    // --- Daily Word Search: generator Lambda + nightly cron + read routes ---
    const wordsearchLogGroup = new logs.LogGroup(this, "WordSearchFnLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const wordsearchFn = new lambdaNode.NodejsFunction(this, "WordSearchFn", {
      entry: path.join(__dirname, "..", "lambda", "wordsearch.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      logGroup: wordsearchLogGroup,
      environment: { TABLE_NAME: table.tableName },
      bundling: {
        minify: true,
        externalModules: ["@aws-sdk/*"],
        // The word pool is bundled, not externalized.
        loader: { ".json": "json" },
      },
    });
    table.grantReadWriteData(wordsearchFn);

    const wordsearchIntegration = new HttpLambdaIntegration(
      "WordSearchIntegration",
      wordsearchFn,
    );
    api.addRoutes({
      path: "/wordsearch/today",
      methods: [HttpMethod.GET],
      integration: wordsearchIntegration,
    });
    api.addRoutes({
      path: "/wordsearch/random",
      methods: [HttpMethod.GET],
      integration: wordsearchIntegration,
    });

    const wordsearchCronFn = new lambdaNode.NodejsFunction(
      this,
      "WordSearchCronFn",
      {
        entry: path.join(__dirname, "..", "lambda", "wordsearch.ts"),
        handler: "scheduled",
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: cdk.Duration.seconds(30),
        logGroup: wordsearchLogGroup,
        environment: { TABLE_NAME: table.tableName },
        bundling: {
          minify: true,
          externalModules: ["@aws-sdk/*"],
          loader: { ".json": "json" },
        },
      },
    );
    table.grantReadWriteData(wordsearchCronFn);

    new events.Rule(this, "WordSearchDailyRule", {
      schedule: events.Schedule.cron({ minute: "10", hour: "5,6" }),
      targets: [new targets.LambdaFunction(wordsearchCronFn)],
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
