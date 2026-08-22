# AWS ECS/Fargate deployment readiness

Target region: `ap-southeast-7` (Asia Pacific — Thailand)

Target ECR repository: `boommall-backend`

The Thailand region is opt-in for AWS accounts. Enable `ap-southeast-7` in the
account before creating ECR, ECS, CloudWatch, Secrets Manager, or S3 resources.

## Container contract

- Build context: `backend/`
- Container port: `4000` by default; override with `PORT`
- Bind address: `0.0.0.0` through `API_HOST_BIND`
- Health check: `GET /health`
- Production command: `npm run start:prod`
- Runtime user: unprivileged `boom`
- Architecture: match the ECS task definition (`linux/amd64` is the
  conservative default).

`start:prod` runs `prisma migrate deploy` before starting the API, matching the
existing backend production contract. Run one deployment at a time and review
database migrations before registering a new task definition revision.

## Required ECS configuration

Non-secret environment variables:

```text
NODE_ENV=production
PORT=4000
API_HOST_BIND=0.0.0.0
AWS_REGION=ap-southeast-7
AWS_S3_BUCKET=boommall-media-prod
DATABASE_SSL_MODE=require
```

Set `CDN_BASE_URL` when media is delivered through CloudFront or another public
media domain. Leave `S3_ENDPOINT` unset for AWS S3. Do not set
`AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in ECS; the AWS SDK uses the task
role credential provider.

Store secrets such as `DATABASE_URL`, `ADMIN_API_KEY`, JWT/OAuth credentials,
payment credentials, and notification credentials in AWS Secrets Manager or
SSM Parameter Store and reference them through the task definition `secrets`
field. Never put secret values in a task definition environment array.

Optional variables depend on enabled modules: `REDIS_URL`, `CORS_ORIGIN`,
`CHAT_SOCKET_PATH`, `CDN_BASE_URL`, database pool settings, and provider-specific
auth/payment/notification settings documented in `.env.example`.

## IAM roles

- Task role: attach only `BoomMallMediaS3Policy`, scoped to
  `boommall-media-prod` and the required object actions. The application uses
  this role for presigned PUT and `HeadObject`. Do not attach
  `AdministratorAccess`.
- Task execution role: attach `AmazonECSTaskExecutionRolePolicy`. Add narrowly
  scoped Secrets Manager or SSM permissions only for secrets referenced by the
  task definition.

The task role and task execution role are different roles. ECR image pulls and
CloudWatch log delivery belong to the execution role; S3 access from application
code belongs to the task role.

## Fargate starting point

- Development/staging: `0.5 vCPU` and `1 GB` memory.
- Increase to `1 vCPU` and `2 GB` if PDF generation, high concurrency, or large
  JSON requests cause CPU throttling or memory pressure.
- Network mode: `awsvpc`.
- Target group health path: `/health`, port `traffic-port`.
- CloudWatch log driver: `awslogs`, region `ap-southeast-7`, stream prefix
  `backend`, and a pre-created log group such as `/ecs/boommall-backend`.

The backend still contains legacy modules that write JSON/chat media under
`/app/data`. Fargate task storage is ephemeral and is not shared between tasks.
Do not scale those legacy paths horizontally until they use PostgreSQL/S3, or
mount durable shared storage with an explicit retention and backup policy.

## ECR build and push commands

Run from the repository root after AWS CLI authentication is configured:

```sh
AWS_REGION=ap-southeast-7
REPOSITORY=boommall-backend
COMMIT_SHA=$(git rev-parse --short=12 HEAD)
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
ECR_REPOSITORY=${ECR_REGISTRY}/${REPOSITORY}

aws ecr describe-repositories \
  --region "$AWS_REGION" \
  --repository-names "$REPOSITORY"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

docker build --platform linux/amd64 \
  -t "${REPOSITORY}:${COMMIT_SHA}" \
  -f backend/Dockerfile backend
docker tag "${REPOSITORY}:${COMMIT_SHA}" "${ECR_REPOSITORY}:${COMMIT_SHA}"
docker tag "${REPOSITORY}:${COMMIT_SHA}" "${ECR_REPOSITORY}:latest"
docker push "${ECR_REPOSITORY}:${COMMIT_SHA}"
docker push "${ECR_REPOSITORY}:latest"
```

Do not create the ECR repository automatically from application code. If the
repository is missing, create it through the approved infrastructure workflow
with encryption, scan-on-push, lifecycle rules, and a tag mutability policy that
keeps commit-SHA tags protected while allowing the required `latest` tag update.
