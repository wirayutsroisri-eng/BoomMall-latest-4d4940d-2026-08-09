# BoomMall — App Store / TestFlight review notes

Copy into App Store Connect → App Review Information → Notes.

## What this build is

BoomMall is a social marketplace: feed, chat, shop listings, and seller warehouse tools.
Physical-goods checkout is visible but **does not claim payment success** until a PSP is live.
Digital currency, tips, top-up, voice/video calls, music upload, and LIVE are **not shipped** in this build.

## Demo account (required)

Use **email + password** (not Sign in with Apple) so the US review team can sign in.

- Email: `apple-review@boommall.com`
- Password: `Password1234`
- Path: open app → เข้าสู่ระบบ → enter the email and password above

If a previous review deleted this account, sign in with the same credentials again. The API recreates the demo account automatically.

## Account deletion (Guideline 5.1.1v)

Profile → **ตั้งค่า** → **ลบบัญชีและข้อมูลทั้งหมด**
(or Profile → ⋯ → ลบบัญชีและข้อมูลทั้งหมด)

This calls `DELETE /api/v1/auth/me` and removes profile, identities, posts, comments, follows, and device data.

## Privacy Policy & Terms (public HTTPS)

Paste these URLs in App Store Connect (App Privacy + Review Information). They must be the public API host, not localhost.

- Privacy Policy: `https://<YOUR-PUBLIC-API>/legal/privacy`
- Terms of Use: `https://<YOUR-PUBLIC-API>/legal/terms`

In-app: Profile → ตั้งค่า → นโยบายความเป็นส่วนตัว / ข้อกำหนดการใช้บริการ (opens Safari when the API URL is HTTPS).

## Background audio

`UIBackgroundModes: audio` is for in-app music / video playback only. There is no VoIP / CallKit.

## Encryption

`ITSAppUsesNonExemptEncryption` = false (standard HTTPS).

## Age rating

Not Kids. UGC: chat, comments, posts, board. Report + block are in-app.

## Before you submit to Apple (not just TestFlight-on-LAN)

1. Point `EXPO_PUBLIC_API_URL` in `eas.json` at a **public HTTPS** API (Apple reviewers are not on your Wi-Fi).
   Production host: **`https://api.boommall.app`** (already set in `eas.json` for `preview`/`play-internal`/`production`).
2. Confirm `https://<API>/legal/privacy` and `/legal/terms` open in a desktop browser.
3. App Privacy nutrition labels: account, user content, identifiers — no tracking / ATT in this build.
4. Enable Sign in with Apple on the App ID `com.boommall.superapp`.
5. Replace `REPLACE_TEAM_ID` in `eas.json` with your Apple Team ID.
6. Paste the demo account into App Review Information.

## Build commands

```bash
npx eas login
npx eas build --platform ios --profile preview
npx eas submit --platform ios --profile preview --latest
```
