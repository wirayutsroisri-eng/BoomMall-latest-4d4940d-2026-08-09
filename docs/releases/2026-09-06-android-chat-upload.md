# Android chat and upload fixes — 6 September 2026

- Android package: `com.boommall.superapp`, APK profile `android-apk`, version 1.0.0 / versionCode 8.
- [EAS build](https://expo.dev/accounts/wirayuts-team/projects/wirayut/builds/d4079c05-e806-4211-aeba-dc5f919647a6).
- Includes the previously implemented Android Feed native binary upload transport and media upload error reporting. Previous TestFlight releases did not deliver those changes to Android.
- Chat attachments now use native binary streaming on Android, with a timeout and explicit storage errors. The API upload fallback is used only when presigning returns 501.
- Chat participant names/photos are resolved against real friend profiles by exact user ID. Missing photos use the existing neutral avatar UI. Random stock portraits and newly synthesized greeting/acceptance messages are removed from these chat paths.
- Identifiable old generated greetings and random portraits are filtered when restoring chat cache. Actual messages and pending/failed outgoing messages are preserved.
- The presence engine no longer simulates peers being online.
- Creator/friend chat creation now saves the returned remote conversation ID.
- Validation: TypeScript passed; 17 targeted tests passed across four files, covering native Feed/chat uploads, failure handling, and legacy generated identity cleanup.
- No Android device was connected (`adb devices` returned an empty list). Physical upload, profile display and two-account chat still require verification on the new APK.
- Build status: FINISHED at 19:45:02 Bangkok time. [Download APK](https://expo.dev/artifacts/eas/4QajL7hBvvkEONzDEmqQWtddYD-Q1paTvdvaKEw2d94.apk). No backend deployment or iOS rebuild in this task.
