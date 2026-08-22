# Cloudflare R2 production configuration

BoomMall uses the existing AWS SDK S3-compatible adapter. R2 is configuration,
not a separate storage implementation.

## Required backend environment

Set these only in the backend secret/environment manager. Never use
`EXPO_PUBLIC_*` variables for storage credentials.

```dotenv
AWS_REGION=
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_ENDPOINT=
CDN_BASE_URL=
```

- `AWS_REGION`: use `auto` for R2.
- `AWS_S3_BUCKET`: the R2 bucket name (`S3_BUCKET` remains a supported alias).
- `S3_ENDPOINT`: the R2 S3 API endpoint, not the public delivery domain.
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`: bucket-scoped R2 S3 API credentials.
- `CDN_BASE_URL`: public read base, normally an R2 custom domain or approved
  public bucket URL. It is deliberately separate from the signing endpoint.

Use a token restricted to Object Read & Write on the single BoomMall media
bucket. Restart the backend after changing storage environment variables.

## R2 bucket setup

The mobile app uploads with a presigned `PUT` to the R2 S3 API endpoint. The
backend owns the key and confirms the result with `HeadObject`. Objects use:

```text
media/{sanitizedOwnerId}/{backendGeneratedMediaAssetId}/original.{extension}
```

For web clients, configure bucket CORS to allow only the deployed application
origins, `PUT` and `HEAD`, and the `Content-Type` and `Content-Length` headers.
iOS native requests do not depend on browser CORS, but keeping a restrictive
policy prevents an accidental permissive web configuration.

## Safe readiness check

Authenticated development requests can call:

```text
GET /api/v1/media-assets/readiness
```

The response reports provider/configuration state and missing variable names.
It never returns credentials, tokens, endpoint values, or signed URLs.

## Database migration

The MediaAsset migration is not applied automatically. Confirm the database is
local/test, then run the project's normal migration command. Production deploy
must use the reviewed deploy workflow and a backup; never run `migrate dev` on
production.
