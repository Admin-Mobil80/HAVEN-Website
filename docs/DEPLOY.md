# Deploying Haven

One CDK stack, `HavenStack`, in `ap-south-1` (Mumbai). It holds:

- a DynamoDB table (`PK`/`SK`, on-demand, TTL on `expiresAt`, retained);
- an S3 media bucket (private, SSL only, retained; objects under `demo/` expire after 7 days);
- one Lambda function (Node 22, arm64, 1024 MB, 30 s) that runs Express behind the Lambda Web Adapter (LWA), with a public Function URL;
- three EventBridge Scheduler schedules (digest 21:00 IST, keep-warm every 5 minutes, demo reset 03:30 IST);
- a 14-day log group, Errors and Throttles alarms to an SNS topic, and a monthly cost budget.

The code lives in `infra/bin/haven.ts` and `infra/lib/haven-stack.ts`. `test/infra.test.ts` synthesizes the stack offline and checks all of the above.

## Prerequisites

- Node 22 or later, and `npm ci` in the repo.
- AWS CLI v2 with credentials for the target account (`export AWS_PROFILE=...`).
- Bedrock model access in `ap-south-1` for the models in `cdk.json` (`bedrockModelId`, `bedrockFallbackModelId`). Run `npm run bakeoff` to confirm they answer from this account.
- The Polly system voice confirmed with `npm run polly-check` (`pollyVoiceSystem` in `cdk.json`, currently `Brian`, still to be confirmed).

All commands below assume `REGION=ap-south-1` and `ACCOUNT=$(aws sts get-caller-identity --query Account --output text)`.

## One-time setup

### 1. Check the Lambda concurrency quota

```sh
aws lambda get-account-settings --region $REGION \
  --query 'AccountLimit.{total:ConcurrentExecutions,unreserved:UnreservedConcurrentExecutions}'
```

New accounts can have a total of 10. If `total` is below 100, ask for more (approval can take a day, so ask early):

```sh
aws service-quotas request-service-quota-increase --region $REGION \
  --service-code lambda --quota-code L-B99A9384 --desired-value 1000
```

The stack does **not** set reserved concurrency. Lambda keeps at least 100 unreserved executions per account, so on a low-quota account a reservation fails the deploy, and on a normal account it only adds a way to throttle judges. Abuse is limited inside the app instead: per-household and per-IP rate limits, plus a daily Bedrock and Polly cap that falls back to the rules brain and cached lines.

### 2. Create the secrets in SSM

CloudFormation cannot create SecureString parameters, so they are created once with the CLI. The function's role can read `/haven/*` and decrypt through SSM only.

```sh
# Signs household tokens and links. Rotating it invalidates every issued token and link.
aws ssm put-parameter --region $REGION --name /haven/household-secret --type SecureString \
  --value "$(openssl rand -base64 48)"

# WhatsApp (see docs/WHATSAPP_SETUP.md). read -rs keeps the values out of shell history.
read -rs WA_TOKEN && aws ssm put-parameter --region $REGION --name /haven/wa-token \
  --type SecureString --value "$WA_TOKEN" && unset WA_TOKEN
read -rs WA_APP_SECRET && aws ssm put-parameter --region $REGION --name /haven/wa-app-secret \
  --type SecureString --value "$WA_APP_SECRET" && unset WA_APP_SECRET
```

To change a value later, run the same command with `--overwrite`.

> **How the function reads the secret.** At startup `loadHouseholdSecret()` in `src/lambda/main.ts` calls `GetParameter` for `${SSM_PREFIX}household-secret` (the stack sets `SSM_PREFIX=/haven/`, so `/haven/household-secret`) with `WithDecryption: true`. If the parameter is missing, empty or shorter than 32 characters, the function logs `haven_startup_failed` and exits, and the Errors alarm fires. `HOUSEHOLD_SECRET` in the environment overrides SSM; it exists only for running the bundle locally. **Never set `HOUSEHOLD_SECRET` on the deployed function**: it would sit in plain environment variables, the next `cdk deploy` would remove it, and if the two values differ every issued judge token and magic link would stop working. The WhatsApp notifier is not wired yet: `createNotifier()` in the same file still returns the simulated notifier and does not read `wa-token` or `wa-app-secret`.

### 3. Pin the Lambda Web Adapter layer version

`cdk.json` sets `lwaLayerArn` to `arn:aws:lambda:ap-south-1:753240598075:layer:LambdaAdapterLayerArm64:30`. That version exists, but nobody has checked whether it is the latest: the build had no network access. Before the first deploy:

1. Read the "Lambda functions packaged as Zip package for AWS managed runtimes" section of the README at https://github.com/awslabs/aws-lambda-web-adapter, and the release notes since the version you pick. Watch for renamed `AWS_LWA_*` variables.
2. Confirm that the layer is reachable from this account. The loop prints every version from 25 up and stops at the first missing one, so the last line printed is the newest:

   ```sh
   for v in $(seq 25 60); do
     aws lambda get-layer-version-by-arn --region $REGION \
       --arn arn:aws:lambda:$REGION:753240598075:layer:LambdaAdapterLayerArm64:$v \
       --query '[Version,CompatibleArchitectures[0],CreatedDate]' --output text 2>/dev/null || break
   done
   ```

3. Change the version in **both** `cdk.json` (`context.lwaLayerArn`) and `DEFAULTS.lwaLayerArn` in `infra/lib/haven-stack.ts`. The infra test fails if the two disagree.

Changing the layer later is an in-place update and keeps the URL.

### 4. Bootstrap CDK in the account and region

```sh
npx cdk bootstrap aws://$ACCOUNT/$REGION
```

### 5. Alert email (optional but recommended)

Keep the address out of the repo: set it in your shell (`export HAVEN_ALERT_EMAIL=you@example.com`) before `npm run deploy`, which passes it as `-c alertEmail`. A deploy without it removes the email subscription. When it is set:

- the SNS topic gets an email subscription. Click the confirmation link AWS sends, or no alarm emails arrive.
- the monthly budget (50 USD) emails at 25 USD and at 50 USD of actual spend. Budgets only warn: they never stop spend.

Pass `-c createBudget=false` to skip the budget, for example if the account already has one.

## Deploy

```sh
npm run deploy
```

The script does three things:

1. `npm run build:lambda`: `scripts/build-lambda.mjs` bundles `src/lambda/main.ts` and every dependency, including the AWS SDK so its version is pinned, into `build/lambda/index.mjs` with a source map. It copies an executable `run.sh` beside it, copies `web/dist` to `build/lambda/web` when it exists, and prints the bundle size and the largest packages.
2. `cdk deploy`: `cdk.json` runs `npx tsx infra/bin/haven.ts`, which refuses to synthesize until `build/lambda` exists.
3. **Not wired yet:** build the web app (`vite build` into `web/dist`) before step 1. Until the `deploy` script does it, run the web build first or the Lambda serves the fallback page.

The `FunctionUrl` stack output is the public app. Smoke test:

```sh
URL=$(aws cloudformation describe-stacks --region $REGION --stack-name HavenStack \
  --query "Stacks[0].Outputs[?OutputKey=='FunctionUrl'].OutputValue" --output text)
curl -fsS "${URL}api/health"   # {"ok":true}
```

The output URL ends with `/`.

## Scheduled events and `/events`

The scheduler invokes the function asynchronously with `{"type":"digest"}`, `{"type":"warm"}` or `{"type":"reset_demo"}`. It also uses async self-invokes (`InvocationType=Event`) for slow jobs. The role may invoke `function:HavenStack-*`, a name pattern rather than the function's own ARN, which would make the role depend on its own function.

Because `AWS_LWA_PASS_THROUGH_PATH=/events`, LWA forwards any non-HTTP event as `POST http://127.0.0.1:3000/events`, with the raw event JSON as the body. Three rules follow:

- **`/events` must reject requests that came through the Function URL.** For HTTP events (Function URL, API Gateway, ALB), LWA adds an `x-amzn-request-context` header built from the event's `requestContext`. A pass-through event has no request context, so the header is absent. `/events` therefore answers 404 to any request that carries `x-amzn-request-context`. Do not use `x-amzn-lambda-context` for this check: LWA sets it on every request. **To verify on the first deploy** (this is based on the LWA docs and has not been tested here):
  - `curl -i -X POST "${URL}events" -H 'content-type: application/json' -d '{"type":"digest"}'` must be rejected.
  - `aws lambda invoke --region $REGION --function-name <fn> --invocation-type Event --cli-binary-format raw-in-base64-out --payload '{"type":"warm"}' /dev/null`, after which the logs show the warm event handled.
- Self-invoke payloads must also be signed (HMAC with the household secret) as defence in depth.
- Every `/events` job must be idempotent. Lambda retries failed async invocations twice, and the digest and reset schedules retry twice within an hour.

The host allowlist must keep `127.0.0.1:3000`, because the readiness check and the pass-through requests use that Host.

## Keeping the URL stable until 20 November

A Function URL lives exactly as long as its function. Anything that replaces the function gives it a new URL.

- **Never set `functionName`**, and never rename the construct ids `HavenStack`, `HavenApp`, `HavenTable` or `HavenMedia`. `test/infra.test.ts` pins the logical ids, so a rename fails the test before it can reach a deploy.
- Never change the stack's name, account or region.
- Do not add CDK feature flags to `cdk.json` after the first deploy unless `cdk diff` shows no replacement.
- Before every deploy, run `npx cdk diff` and look for `replace` on the function, the URL, the table or the bucket. Code, environment, layer, memory and timeout changes are all in-place updates.
- Termination protection is on, so `cdk destroy` fails until someone runs `aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name HavenStack --region $REGION`.
- The table and the bucket are `RETAIN`. If the stack is deleted, they stay behind with their data. A new stack would create new, empty ones with new generated names.
- Publish the URL in the README and on Devpost only after the final deploy before the freeze.

## Observability

- Logs: the `HavenAppLogs` log group, kept for 14 days.
- The **Errors** alarm fires on 5 or more errors in 5 minutes. Lambda counts only crashes, timeouts and init failures as errors. An Express 500 is a normal response to the adapter and does not count, so look for app errors in the logs, for example with Logs Insights: `fields @timestamp, @message | filter @message like /(?i)error|haven_startup_failed/`. A startup failure logs `haven_startup_failed` and counts as an init error.
- The **Throttles** alarm fires on any throttle. If it does, check the concurrency quota (step 1).
- Both alarms notify the `AlarmTopicArn` output topic.

## Cost notes

- Point-in-time recovery is off, because demo households are reseeded.
- Demo media expires after 7 days, demo households expire through the table TTL, and incomplete multipart uploads are cleaned up after a day.
- The keep-warm schedule invokes the function about 8,600 times a month. That fits inside the Lambda free tier.
