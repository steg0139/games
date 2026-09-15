# Deployment

CI/CD is handled by GitHub Actions (`.github/workflows/deploy.yml`). On every
push to `main` (or a manual run via **Actions → Deploy → Run workflow**), the
pipeline:

1. Deploys the **backend** CDK stack (`CardGamesStack`) — DynamoDB + Lambda + HTTP API.
2. Reads the backend's `ApiUrl` output.
3. Builds the **frontend** with `VITE_API_BASE_URL` set to that URL.
4. Deploys the **hosting** CDK stack (`CardGamesHostingStack`) — S3 + CloudFront.
5. Syncs the built site to S3 and invalidates the CloudFront cache.

The public URL is printed in the workflow run summary as **Site** (the
CloudFront domain).

**Region:** `us-east-2`.

## One-time setup

### 1. AWS credentials (repo secrets)

The workflow authenticates with static access keys. Create an IAM user (or use
existing credentials) with permissions to deploy the stacks (CloudFormation,
S3, CloudFront, Lambda, DynamoDB, API Gateway, IAM, Logs), then add two
repository secrets in GitHub:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret name             | Value                        |
| ----------------------- | ---------------------------- |
| `AWS_ACCESS_KEY_ID`     | the IAM user's access key id |
| `AWS_SECRET_ACCESS_KEY` | the IAM user's secret key    |

> These are long-lived credentials. Scope the IAM user's policy as tightly as
> you can, and rotate the keys periodically. Switching to GitHub OIDC role
> assumption later removes the stored secret entirely.

### 2. Bootstrap CDK (once per account/region)

CDK needs a one-time bootstrap in the target account and region. Run locally
with credentials for the same account:

```bash
cd infra
npm install
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-2
```

That's it. Push to `main` and the pipeline takes over.

## Deploying manually (optional)

You can deploy from your machine instead of CI:

```bash
# Backend
cd infra
npm install
npx cdk deploy CardGamesStack --require-approval never

# Grab the ApiUrl output it prints, then build the frontend with it:
cd ..
VITE_API_BASE_URL=<ApiUrl> npm run build

# Hosting
cd infra
npx cdk deploy CardGamesHostingStack --require-approval never

# Upload + invalidate (read the outputs for bucket / distribution id)
aws s3 sync ../dist "s3://<SiteBucketName>/" --delete
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*"
```

## Notes

- **Deploy order matters.** The frontend build needs the backend's API URL, so
  the backend deploys first. The workflow chains this automatically.
- **Caching.** Fingerprinted assets are uploaded with a long immutable
  cache; `index.html`, the service worker, and the manifest are uploaded with
  `no-cache` so app updates are picked up promptly. CloudFront is fully
  invalidated on each deploy.
- **Data safety.** The DynamoDB table uses a `RETAIN` removal policy — it
  survives a stack teardown. The hosting bucket is disposable (`DESTROY`),
  since the site is rebuilt from source.
- **Teardown.** `cd infra && npx cdk destroy` removes the stacks (the
  DynamoDB table is retained and must be deleted manually if you truly want it
  gone).
