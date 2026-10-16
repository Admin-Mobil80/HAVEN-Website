import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { App, Tags } from "aws-cdk-lib";
import { HAVEN_REGION, HavenStack } from "../lib/haven-stack.js";

const lambdaAssetPath = fileURLToPath(new URL("../../build/lambda", import.meta.url));
// Fail with the fix instead of CDK's generic "Cannot find asset".
for (const file of ["index.mjs", "run.sh"]) {
  if (!existsSync(join(lambdaAssetPath, file))) {
    throw new Error(`build/lambda/${file} is missing: run "npm run build:lambda" first (npm run deploy does it)`);
  }
}

const app = new App();
Tags.of(app).add("project", "haven");

// The stack id is frozen: it prefixes the generated function name, and the self-invoke IAM
// statement matches function:HavenStack-*.
new HavenStack(app, "HavenStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: HAVEN_REGION },
  description: "Haven: Digital Priya companion (Lambda Web Adapter + Express, DynamoDB, S3, Scheduler)",
  lambdaAssetPath,
});
