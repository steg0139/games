# Card Games — Infrastructure (AWS CDK)

Serverless backend that backs up each device's game stats to DynamoDB.

**Region:** `us-east-2` (default; override with `CDK_DEFAULT_REGION`).

## What it creates

- **DynamoDB table** (single-table design, on-demand billing, PITR enabled, `RETAIN` on delete). Key schema: `PK = DEVICE#<id>`, `SK = "PROFILE"`.
- **Lambda** (`profile.ts`, Node 20, ARM64) handling the profile API.
- **HTTP API Gateway** with routes `GET /profile` and `PUT /profile`, CORS enabled. Device is identified by the `x-device-id` request header.

## Prerequisites

- Node 18+ and npm
- AWS credentials configured (`aws configure` or SSO) for the target account
- CDK bootstrapped in the account/region once:

```bash
npm install
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-2
```

## Deploy

```bash
npm install
npm run deploy
```

On success, CDK prints outputs including **`ApiUrl`**. Put that value in the
frontend's `.env` as `VITE_API_BASE_URL` (no trailing slash), then rebuild the
frontend.

## Useful commands

- `npm run synth` — synthesize the CloudFormation template (no deploy)
- `npm run diff` — show changes vs. deployed stack
- `npm run destroy` — tear down (the DynamoDB table is retained by policy)

## API

| Method | Path       | Headers            | Body            | Response                    |
| ------ | ---------- | ------------------ | --------------- | --------------------------- |
| GET    | `/profile` | `x-device-id`      | —               | `200` profile / `404` none  |
| PUT    | `/profile` | `x-device-id`, JSON| full profile    | `200 {ok:true}`             |

The device id is a client-generated UUID stored in the browser's
`localStorage`. This is intentionally anonymous — no accounts. To move to real
accounts later, swap the header check for an authorizer (e.g. Cognito) and key
items by user id instead of device id.
