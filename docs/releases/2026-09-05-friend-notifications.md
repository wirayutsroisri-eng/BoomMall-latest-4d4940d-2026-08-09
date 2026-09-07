# Friend notification release — 5 September 2026

Changes: app-wide incoming friend request banners, push request/acceptance handling, direct chat navigation on acceptance, account-scoped request synchronization, QR/search corrections, and Android media upload fixes.

## Backend

- Production: `https://api.boommall.app`
- AWS region: `ap-southeast-7`
- ECS cluster/service: `boommall-prod` / `boommall-backend-service-wk51uui4`
- Deployed task definition: `boommall-backend:10`
- Previous task definition: `boommall-backend:9`
- Image tag: `friend-notify-20260905-1609`
- Image digest: `sha256:7fe99a8617bca67dee0c58ee8858b785eafa9fd49c636492892155b0c5dcbcb2`
- ECS rollout completed with one healthy running task. Public `/health` returned 200; anonymous `/api/v1/friends/requests` returned 401 as expected.
- Startup applied three previously pending migrations: `20260902120000_feed_serving_v2_foundation`, `20260902140000_shoppable_posts`, and `20260902160000_gp_tax_fields`.
- Deployed the tested working-directory image directly through AWS; the existing GitHub Actions deployment path has an OIDC role-assumption failure. Railway is not the production endpoint.

## iOS

- Bundle ID: `com.boommall.social`
- Version/build: `1.0.0 (2)`
- EAS profile: `preview`
- [Successful iOS build](https://expo.dev/accounts/wirayuts-team/projects/wirayut/builds/476d04c5-90d4-43b1-a19b-6a291f6aac26)
- [TestFlight submission](https://expo.dev/accounts/wirayuts-team/projects/wirayut/submissions/cb3fc326-a6ee-4755-93da-e1030b17e898)
- EAS submission finished successfully at 16:17:57 Bangkok time (09:17:57 UTC).
- Submission logs confirm Apple accepted the uploaded package. A subsequent App Store Connect API check confirmed that **both build 2 and build 1 have processingState INVALID**. Build 2 is not available for testing; successful EAS submission did not mean Apple validation succeeded.
- Apple's buildUploads endpoint reports COMPLETE with empty errors/warnings for both uploads, so it does not expose the later binary rejection reason here. The Apple rejection message/ITMS code is needed to identify the required correction. No replacement build has been submitted yet.
- Marketing version remains 1.0.0; the new upload is distinguished by build number 2. Changing the marketing version alone does not resolve binary validation.
- App Store Connect app ID: `6801470616`

## Validation

- Root suite: 246 tests passed across 51 files.
- Backend suite: 119 tests passed across 22 files (overlaps the root suite).
- App and backend TypeScript checks passed.
- Physical two-account push/QR/chat verification remains a device check; follow [the verification steps](../friend-qr-verification.md) using the new app build on both devices.

## Device test

Send a QR friend request while the receiving account is browsing Feed. Open the incoming-request banner and accept; the direct chat should open. Check background push taps, acceptance notification on the sender, and switching accounts on one device. Verify photo upload with the updated Android app separately; this release builds iOS only.
