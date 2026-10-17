import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { DEFAULTS, HavenStack } from "../infra/lib/haven-stack.js";

// Hermetic: a fixture directory stands in for build/lambda, so the test needs no bundle.
const assetDir = mkdtempSync(join(tmpdir(), "haven-lambda-asset-"));
writeFileSync(join(assetDir, "index.mjs"), "export {};\n");
writeFileSync(join(assetDir, "run.sh"), "#!/bin/sh\nexec node index.mjs\n", { mode: 0o755 });
after(() => rmSync(assetDir, { recursive: true, force: true }));

const ACCOUNT = "123456789012";
const env = { account: ACCOUNT, region: "ap-south-1" };

function synth(context: Record<string, unknown> = {}) {
  const app = new App({ context });
  const stack = new HavenStack(app, "HavenStack", { env, lambdaAssetPath: assetDir });
  return { stack, template: Template.fromStack(stack) };
}

type Resource = { Type: string; Properties: Record<string, any>; DeletionPolicy?: string };
const ofType = (template: Template, type: string) =>
  Object.entries(template.toJSON().Resources as Record<string, Resource>).filter(([, r]) => r.Type === type);

const statements = (template: Template): { Sid?: string; Action: string | string[]; Resource: unknown; Condition?: unknown }[] =>
  ofType(template, "AWS::IAM::Policy").flatMap(([, r]) => r.Properties.PolicyDocument.Statement);

const { stack, template } = synth();

describe("HavenStack", () => {
  it("is pinned to ap-south-1 with termination protection", () => {
    assert.equal(stack.region, "ap-south-1");
    assert.equal(stack.terminationProtection, true);
    assert.throws(
      () => new HavenStack(new App(), "HavenStack", { env: { account: ACCOUNT, region: "us-east-1" }, lambdaAssetPath: assetDir }),
      /ap-south-1/,
    );
  });

  // Renaming a construct id replaces the resource: a new function means a new Function URL, and a
  // retained table/bucket would be orphaned. If this test fails, the public URL would change.
  it("keeps the logical ids the public URL depends on", () => {
    const ids = Object.keys(template.toJSON().Resources);
    for (const id of ["HavenApp243976C7", "HavenAppFunctionUrl7B162761", "HavenTable3B29D10B", "HavenMedia3DB088A6"]) {
      assert.ok(ids.includes(id), `missing logical id ${id}`);
    }
  });

  it("exposes a public Function URL without CORS", () => {
    template.resourceCountIs("AWS::Lambda::Url", 1);
    template.hasResourceProperties("AWS::Lambda::Url", { AuthType: "NONE", InvokeMode: "BUFFERED", Cors: Match.absent() });
    template.hasResourceProperties("AWS::Lambda::Permission", { Action: "lambda:InvokeFunctionUrl", FunctionUrlAuthType: "NONE" });
  });

  it("creates a PK/SK on-demand table with TTL, retained, without PITR", () => {
    template.hasResource("AWS::DynamoDB::Table", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
      Properties: Match.objectLike({
        BillingMode: "PAY_PER_REQUEST",
        KeySchema: [
          { AttributeName: "PK", KeyType: "HASH" },
          { AttributeName: "SK", KeyType: "RANGE" },
        ],
        TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: false },
        TableName: Match.absent(),
      }),
    });
  });

  it("creates a private, SSL-only, retained media bucket that expires demo/ after 7 days", () => {
    template.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
      Properties: Match.objectLike({
        PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
        BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
        LifecycleConfiguration: {
          Rules: Match.arrayWith([Match.objectLike({ Prefix: "demo/", ExpirationInDays: 7, Status: "Enabled" })]),
        },
      }),
    });
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: "Deny", Condition: { Bool: { "aws:SecureTransport": "false" } } }),
        ]),
      },
    });
  });

  it("runs Express behind the Lambda Web Adapter on arm64", () => {
    template.resourceCountIs("AWS::Lambda::Function", 1);
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "run.sh",
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      MemorySize: 1024,
      Timeout: 120,
      Layers: [DEFAULTS.lwaLayerArn],
      FunctionName: Match.absent(),
      ReservedConcurrentExecutions: Match.absent(),
      LoggingConfig: { LogGroup: Match.anyValue() },
      Environment: {
        Variables: Match.objectLike({
          AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
          AWS_LWA_PORT: "3000",
          AWS_LWA_READINESS_CHECK_PATH: "/api/health",
          AWS_LWA_PASS_THROUGH_PATH: "/events",
          AWS_LWA_INVOKE_MODE: "buffered",
          NODE_OPTIONS: "--enable-source-maps",
          TABLE_NAME: { Ref: Match.stringLikeRegexp("^HavenTable") },
          MEDIA_BUCKET: { Ref: Match.stringLikeRegexp("^HavenMedia") },
          BEDROCK_MODEL_ID: "openai.gpt-oss-120b-1:0",
          BEDROCK_FALLBACK_MODEL_ID: "apac.amazon.nova-lite-v1:0",
          POLLY_VOICE_PRIYA: "Kajal",
          POLLY_VOICE_SYSTEM: "Brian",
          SSM_PREFIX: "/haven/",
        }),
      },
    });
    template.hasResourceProperties("AWS::Logs::LogGroup", { RetentionInDays: 14 });
  });

  it("never puts a secret in the function environment", () => {
    const [[, fn]] = ofType(template, "AWS::Lambda::Function");
    const keys = Object.keys(fn.Properties.Environment.Variables);
    assert.deepEqual(keys.filter((k) => /SECRET|TOKEN|PASSWORD/i.test(k)), []);
  });

  it("schedules digest, keep-warm and demo reset", () => {
    template.resourceCountIs("AWS::Scheduler::Schedule", 3);
    const schedules = ofType(template, "AWS::Scheduler::Schedule").map(([, r]) => r.Properties);
    const byType = (type: string) => {
      const props = schedules.find((p) => JSON.parse(p.Target.Input).type === type);
      assert.ok(props, `no schedule with input type ${type}`);
      return props;
    };
    assert.equal(byType("digest").ScheduleExpression, "cron(0 21 * * ? *)");
    assert.equal(byType("digest").ScheduleExpressionTimezone, "Asia/Kolkata");
    assert.equal(byType("warm").ScheduleExpression, "rate(5 minutes)");
    assert.equal(byType("reset_demo").ScheduleExpression, "cron(30 3 * * ? *)");
    assert.equal(byType("reset_demo").ScheduleExpressionTimezone, "Asia/Kolkata");
    for (const props of schedules) {
      assert.deepEqual(props.Target.Arn, { "Fn::GetAtt": ["HavenApp243976C7", "Arn"] });
    }
  });

  it("grants Bedrock on inference profiles and foundation models", () => {
    const bedrock = statements(template).find((s) => [s.Action].flat().includes("bedrock:InvokeModel"));
    assert.ok(bedrock, "no bedrock statement");
    assert.deepEqual([bedrock.Action].flat().sort(), [
      "bedrock:Converse",
      "bedrock:ConverseStream",
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]);
    const resources = [bedrock.Resource].flat();
    assert.ok(resources.includes(`arn:aws:bedrock:*:${ACCOUNT}:inference-profile/*`));
    assert.ok(resources.includes("arn:aws:bedrock:*::foundation-model/*"));
  });

  it("scopes SSM, KMS, Polly and self-invoke permissions", () => {
    const all = statements(template);
    const find = (action: string) => all.find((s) => [s.Action].flat().includes(action));
    assert.deepEqual(find("ssm:GetParameter")?.Resource, `arn:aws:ssm:ap-south-1:${ACCOUNT}:parameter/haven/*`);
    assert.deepEqual(find("kms:Decrypt")?.Condition, { StringEquals: { "kms:ViaService": "ssm.ap-south-1.amazonaws.com" } });
    assert.ok(find("polly:SynthesizeSpeech") && find("polly:DescribeVoices"));
    // A literal pattern, not the function's own ARN (which would be a circular reference).
    const selfInvoke = all.find((s) => s.Sid === "SelfInvoke");
    assert.equal(selfInvoke?.Resource, `arn:aws:lambda:ap-south-1:${ACCOUNT}:function:HavenStack-*`);
  });

  it("alarms on errors and throttles", () => {
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      MetricName: "Errors",
      Threshold: 5,
      Period: 300,
      ComparisonOperator: "GreaterThanOrEqualToThreshold",
    });
    template.hasResourceProperties("AWS::CloudWatch::Alarm", { MetricName: "Throttles", Threshold: 1 });
  });

  it("subscribes nobody without alertEmail", () => {
    template.resourceCountIs("AWS::SNS::Subscription", 0);
    template.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: { BudgetLimit: { Amount: 50, Unit: "USD" }, BudgetType: "COST", TimeUnit: "MONTHLY" },
      NotificationsWithSubscribers: Match.absent(),
    });
  });

  it("emails alarms and 25/50 USD budget alerts when alertEmail is set", () => {
    const { template: t } = synth({ alertEmail: "ops@example.com" });
    t.hasResourceProperties("AWS::SNS::Subscription", { Protocol: "email", Endpoint: "ops@example.com" });
    const [[, budget]] = ofType(t, "AWS::Budgets::Budget");
    const notes = budget.Properties.NotificationsWithSubscribers as any[];
    assert.deepEqual(notes.map((n) => n.Notification.Threshold), [25, 50]);
    for (const n of notes) {
      assert.equal(n.Notification.NotificationType, "ACTUAL");
      assert.deepEqual(n.Subscribers, [{ SubscriptionType: "EMAIL", Address: "ops@example.com" }]);
    }
  });

  it("rejects a malformed alertEmail and can skip the budget", () => {
    assert.throws(() => synth({ alertEmail: "not-an-email" }), /alertEmail/);
    synth({ createBudget: false }).template.resourceCountIs("AWS::Budgets::Budget", 0);
  });

  it("reads overrides from context", () => {
    const arn = "arn:aws:lambda:ap-south-1:753240598075:layer:LambdaAdapterLayerArm64:99";
    const { template: t } = synth({ lwaLayerArn: arn, pollyVoiceSystem: "Arthur", bedrockModelId: "apac.amazon.nova-lite-v1:0" });
    t.hasResourceProperties("AWS::Lambda::Function", {
      Layers: [arn],
      Environment: { Variables: Match.objectLike({ POLLY_VOICE_SYSTEM: "Arthur", BEDROCK_MODEL_ID: "apac.amazon.nova-lite-v1:0" }) },
    });
  });

  // cdk.json is what `cdk deploy` reads; the stack's DEFAULTS are what this test synthesizes.
  it("keeps cdk.json context in step with the stack defaults", () => {
    const cdkJson = JSON.parse(readFileSync(new URL("../cdk.json", import.meta.url), "utf8"));
    assert.equal(cdkJson.app, "npx tsx infra/bin/haven.ts");
    for (const key of ["lwaLayerArn", "bedrockModelId", "bedrockFallbackModelId", "pollyVoiceSystem", "waPhoneNumberId", "waGraphVersion", "waLiveHouseholds"] as const) {
      assert.equal(cdkJson.context[key], DEFAULTS[key], `cdk.json context.${key}`);
    }
  });

  it("outputs the Function URL, table and bucket names", () => {
    const outputs = template.toJSON().Outputs as Record<string, { Value: unknown }>;
    assert.deepEqual(outputs.FunctionUrl.Value, { "Fn::GetAtt": ["HavenAppFunctionUrl7B162761", "FunctionUrl"] });
    assert.ok(outputs.TableName && outputs.BucketName);
  });
});
