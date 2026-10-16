import { CfnOutput, Duration, RemovalPolicy, Stack, TimeZone, type StackProps } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as targets from "aws-cdk-lib/aws-scheduler-targets";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";

export const HAVEN_REGION = "ap-south-1";

// Fallbacks for the cdk.json context keys of the same name (cdk.json is the place to change them).
export const DEFAULTS = {
  // Lambda Web Adapter arm64 layer; v30 is the latest per the awslabs/aws-lambda-web-adapter README (16 Oct).
  lwaLayerArn: "arn:aws:lambda:ap-south-1:753240598075:layer:LambdaAdapterLayerArm64:30",
  bedrockModelId: "openai.gpt-oss-120b-1:0",
  bedrockFallbackModelId: "apac.amazon.nova-lite-v1:0",
  // Confirmed available in ap-south-1 by scripts/polly-check.ts (16 Oct).
  pollyVoiceSystem: "Brian",
  // WhatsApp Cloud API test number (not a secret; the token is in SSM). Empty disables WhatsApp.
  waPhoneNumberId: "989594664244778",
  waGraphVersion: "v23.0",
  // Households that may send real WhatsApp messages; every other household is simulated.
  waLiveHouseholds: "owner",
  monthlyBudgetUsd: 50,
} as const;

export type HavenStackProps = StackProps & {
  // Directory holding index.mjs + run.sh (scripts/build-lambda.mjs output). Tests pass a fixture.
  lambdaAssetPath: string;
};

// One stack, one Lambda behind one Function URL. The URL must stay stable until 20 Nov:
// construct ids below are frozen (renaming "HavenApp" replaces the function and its URL),
// functionName is never set, and the table and bucket are retained.
export class HavenStack extends Stack {
  constructor(scope: Construct, id: string, props: HavenStackProps) {
    super(scope, id, { ...props, terminationProtection: true });
    if (this.region !== HAVEN_REGION) throw new Error(`HavenStack must be pinned to ${HAVEN_REGION} (env.region)`);

    const lwaLayerArn = this.contextString("lwaLayerArn", DEFAULTS.lwaLayerArn);
    const alertEmail = this.alertEmail();

    const table = new dynamodb.Table(this, "HavenTable", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      // PITR costs more than the demo data is worth; judge households are reseeded anyway.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const bucket = new s3.Bucket(this, "HavenMedia", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        { id: "expire-demo-media", prefix: "demo/", expiration: Duration.days(7) },
        { id: "abort-incomplete-uploads", abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
      // /api/media answers with a 302 to a presigned GET. The Function URL host is unknown at synth
      // time (it would be a circular reference), so any origin may read; the presigned URL is the auth.
      cors: [{ allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD], allowedOrigins: ["*"], maxAge: 3000 }],
    });

    const logGroup = new logs.LogGroup(this, "HavenAppLogs", {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Plain lambda.Function, not NodejsFunction: scripts/build-lambda.mjs bundles index.mjs and the
    // executable run.sh that the Lambda Web Adapter needs as its handler.
    // No reservedConcurrentExecutions: Lambda keeps at least 100 unreserved per account and new
    // accounts can have a regional limit of 10, so reserving fails the deploy or throttles judges.
    // Abuse is limited in-app (per-household and per-IP rate limits, daily Bedrock/Polly caps).
    const fn = new lambda.Function(this, "HavenApp", {
      description: "Haven: Express on the Lambda Web Adapter (web app, /mcp, /api, webhooks, /events)",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(30),
      code: lambda.Code.fromAsset(props.lambdaAssetPath),
      handler: "run.sh",
      layers: [lambda.LayerVersion.fromLayerVersionArn(this, "LwaLayer", lwaLayerArn)],
      logGroup,
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        AWS_LWA_PORT: "3000",
        AWS_LWA_READINESS_CHECK_PATH: "/api/health",
        // Non-HTTP invocations (Scheduler, async self-invoke) are POSTed here with the raw event as body.
        AWS_LWA_PASS_THROUGH_PATH: "/events",
        AWS_LWA_INVOKE_MODE: "buffered",
        NODE_OPTIONS: "--enable-source-maps",
        // Express prints stack traces in error responses unless NODE_ENV is production.
        NODE_ENV: "production",
        TABLE_NAME: table.tableName,
        MEDIA_BUCKET: bucket.bucketName,
        BEDROCK_MODEL_ID: this.contextString("bedrockModelId", DEFAULTS.bedrockModelId),
        BEDROCK_FALLBACK_MODEL_ID: this.contextString("bedrockFallbackModelId", DEFAULTS.bedrockFallbackModelId),
        POLLY_VOICE_PRIYA: "Kajal",
        POLLY_VOICE_SYSTEM: this.contextString("pollyVoiceSystem", DEFAULTS.pollyVoiceSystem),
        SSM_PREFIX: "/haven/",
        WA_PHONE_NUMBER_ID: this.contextString("waPhoneNumberId", DEFAULTS.waPhoneNumberId),
        WA_GRAPH_VERSION: this.contextString("waGraphVersion", DEFAULTS.waGraphVersion),
        WA_LIVE_HOUSEHOLDS: this.contextString("waLiveHouseholds", DEFAULTS.waLiveHouseholds),
      },
    });

    // Same-origin app: no CORS on the URL. Auth is in-app (household tokens, signed paths).
    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    this.grantAppPermissions(fn, table, bucket);
    this.addSchedules(fn);
    const alarmTopic = this.addAlarms(fn, alertEmail);
    if (this.contextBool("createBudget", true)) this.addBudget(alertEmail);

    new CfnOutput(this, "FunctionUrl", { value: fnUrl.url, description: "Public app URL (stable until the stack is deleted)" });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new CfnOutput(this, "AlarmTopicArn", { value: alarmTopic.topicArn });
  }

  private grantAppPermissions(fn: lambda.Function, table: dynamodb.Table, bucket: s3.Bucket) {
    table.grantReadWriteData(fn);
    bucket.grantReadWrite(fn);

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "Polly",
        actions: ["polly:SynthesizeSpeech", "polly:DescribeVoices"],
        resources: ["*"],
      }),
    );
    // Global/cross-Region inference profiles route to foundation models in other Regions, so the
    // model ARNs are wildcarded by Region. The Region-less form is what global profiles evaluate.
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "Bedrock",
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Converse", "bedrock:ConverseStream"],
        resources: [
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:::foundation-model/*",
        ],
      }),
    );
    // SecureStrings are created with the CLI (CloudFormation cannot create them); see docs/DEPLOY.md.
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "SsmParams",
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/haven/*`],
      }),
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "KmsViaSsm",
        actions: ["kms:Decrypt"],
        resources: ["*"],
        conditions: { StringEquals: { "kms:ViaService": `ssm.${this.region}.amazonaws.com` } },
      }),
    );
    // Async self-invoke (InvocationType=Event) for slow jobs. A name pattern instead of fn.functionArn,
    // which would make the role policy depend on the function it belongs to.
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "SelfInvoke",
        actions: ["lambda:InvokeFunction"],
        resources: [`arn:aws:lambda:${this.region}:${this.account}:function:${this.stackName}-*`],
      }),
    );
  }

  // The adapter forwards these non-HTTP events to /events (AWS_LWA_PASS_THROUGH_PATH).
  // Every /events job must be idempotent: Lambda retries failed async invocations.
  private addSchedules(fn: lambda.IFunction) {
    const ist = TimeZone.ASIA_KOLKATA;
    const invoke = (type: string, retryAttempts: number, maxEventAge: Duration) =>
      new targets.LambdaInvoke(fn, { input: scheduler.ScheduleTargetInput.fromObject({ type }), retryAttempts, maxEventAge });

    new scheduler.Schedule(this, "DigestSchedule", {
      description: "Daily family digest, 21:00 IST",
      schedule: scheduler.ScheduleExpression.cron({ minute: "0", hour: "21", timeZone: ist }),
      target: invoke("digest", 2, Duration.hours(1)),
    });
    new scheduler.Schedule(this, "WarmSchedule", {
      description: "Keep one execution environment warm",
      schedule: scheduler.ScheduleExpression.rate(Duration.minutes(5)),
      target: invoke("warm", 0, Duration.minutes(1)),
    });
    new scheduler.Schedule(this, "DemoResetSchedule", {
      description: "Nightly reset of the public demo household, 03:30 IST",
      schedule: scheduler.ScheduleExpression.cron({ minute: "30", hour: "3", timeZone: ist }),
      target: invoke("reset_demo", 2, Duration.hours(1)),
    });
  }

  // Lambda Errors counts crashes, timeouts and init failures only: an Express 500 is a normal
  // response to the adapter, so app-level errors need log-based checks (see docs/DEPLOY.md).
  private addAlarms(fn: lambda.Function, alertEmail: string | undefined) {
    const topic = new sns.Topic(this, "AlarmTopic", { displayName: "Haven alarms" });
    if (alertEmail) topic.addSubscription(new subs.EmailSubscription(alertEmail));
    const action = new cwActions.SnsAction(topic);

    const errors = new cloudwatch.Alarm(this, "ErrorsAlarm", {
      alarmDescription: "Haven Lambda: 5 or more errors in 5 minutes",
      metric: fn.metricErrors({ period: Duration.minutes(5), statistic: cloudwatch.Stats.SUM }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    const throttles = new cloudwatch.Alarm(this, "ThrottlesAlarm", {
      alarmDescription: "Haven Lambda: throttled (check the account concurrency quota)",
      metric: fn.metricThrottles({ period: Duration.minutes(5), statistic: cloudwatch.Stats.SUM }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    errors.addAlarmAction(action);
    throttles.addAlarmAction(action);
    return topic;
  }

  // Budgets only warn; they never stop spend.
  private addBudget(alertEmail: string | undefined) {
    const limit = DEFAULTS.monthlyBudgetUsd;
    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: limit, unit: "USD" },
      },
      notificationsWithSubscribers: alertEmail
        ? [25, limit].map((usd) => ({
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: usd,
              thresholdType: "ABSOLUTE_VALUE",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: alertEmail }],
          }))
        : undefined,
    });
  }

  private contextString(key: string, fallback: string): string {
    const value: unknown = this.node.tryGetContext(key);
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value !== "string") throw new Error(`context "${key}" must be a string`);
    return value.trim();
  }

  private contextBool(key: string, fallback: boolean): boolean {
    const value: unknown = this.node.tryGetContext(key);
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "false") return value === "true";
    throw new Error(`context "${key}" must be true or false`);
  }

  private alertEmail(): string | undefined {
    const email = this.contextString("alertEmail", "");
    if (!email) return undefined;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`context "alertEmail" is not an email address`);
    return email;
  }
}
