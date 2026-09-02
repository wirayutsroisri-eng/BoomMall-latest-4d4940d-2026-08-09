# Apple & iOS

เป้าหมาย: ออกบิลด์ขึ้น TestFlight และ App Store ได้ซ้ำได้โดยไม่ต้องเดา

**ห้ามเก็บ Apple password / recovery code / App-Specific Password / `.p8` ใน repo**
เก็บใน 1Password หรือ AWS Secrets Manager เท่านั้น

## Inventory (อัปเดต 2026-09-02)

- Apple Developer Team ID: **`APZ4563SL9`** (จาก `eas.json` → `submit.*.ios.appleTeamId`)
- Bundle ID: **`com.boommall.superapp`** (iOS + Android package เดียวกัน — `app.config.ts`)
- App display name: **BoomMall** · slug `wirayut` · scheme `boommall`
- Expo owner / org: **`wirayuts-team`**
- EAS project id: **`2bc92448-2796-4632-bbe8-def51f4da8f6`**
- Marketing version: `1.0.0` (`app.json` → `expo.version`)
- Build number: **ไม่ต้องแก้เอง** — `eas.json` ตั้ง `appVersionSource: "remote"` + `autoIncrement: true` EAS เป็นคนเพิ่มให้
- API ที่บิลด์ชี้ไป: **`https://api.boommall.app`** (ตั้งใน `eas.json` ทุก profile — ไม่ใช่ `.env` ของเครื่อง)

## Build profiles (`eas.json`)

| profile | ใช้ทำอะไร | distribution | channel |
|---|---|---|---|
| `development` | dev client ลงเครื่องตัวเอง | internal | — |
| `preview` | **TestFlight** | store | `preview` |
| `production` | ปล่อยขึ้น App Store | store | `production` |
| `play-internal` | Google Play internal track | store (aab) | `preview` |

## ขั้นตอนขึ้น TestFlight

```bash
# 0) หลังบ้านต้องพร้อมก่อน — บิลด์ยิงเข้า production จริง
npm --prefix backend run prisma:deploy

# 1) บิลด์
npx eas login
npx eas build --platform ios --profile preview

# 2) ส่งเข้า App Store Connect
npx eas submit --platform ios --profile preview --latest
```

จากนั้นใน App Store Connect:

1. **TestFlight → Internal Testing** — เพิ่มทีมตัวเอง ใช้ได้ทันที ไม่ต้องรอรีวิว
2. **External Testing** — ต้องผ่าน Beta App Review (ปกติ 1–2 วัน) และต้องกรอก What to Test
3. **App Review Information** — คัดลอกจาก `docs/app-store-review-notes.md` (มีบัญชีทดสอบและวิธีลบบัญชีครบแล้ว)

## Signing / Provisioning

- EAS จัดการ certificate + provisioning profile ให้อัตโนมัติครั้งแรกที่บิลด์ (ตอบ Apple ID ตอนถาม)
- ตรวจของที่มีอยู่: `npx eas credentials --platform ios`
- ถ้าเปลี่ยนเครื่อง ไม่ต้องสร้างใหม่ — credential เก็บไว้ที่ EAS ผูกกับ project id ด้านบน

## Capabilities ที่เปิดจริงในบิลด์นี้

- **Sign in with Apple** — `usesAppleSignIn: true` (บังคับตาม Guideline 4.8 เพราะมี Google login)
- **Push Notifications** — plugin `expo-notifications` (icon + สี + channel `chat-reminders`)
- **Background modes: `audio` เท่านั้น** — ห้ามใส่ `voip` จนกว่าจะมี CallKit/PushKit จริง (Guideline 2.5.4)
- **Associated domains: ยังไม่ได้ตั้ง** — ถ้าจะทำ universal link ของลิงก์แชร์ `/s/{shortId}` ต้องเพิ่มทีหลังพร้อมไฟล์ `apple-app-site-association` ที่ `api.boommall.app`
- Face ID · กล้อง · ไมค์ · คลังภาพ — permission string อยู่ใน `app.config.ts` และ `app.json`

## Privacy declarations

- `privacyManifests` (PrivacyInfo) ประกาศไว้ใน `app.json` แล้ว — UserDefaults / FileTimestamp ฯลฯ
- `ITSAppUsesNonExemptEncryption: false` → ตอน submit จะไม่ถาม export compliance
- Privacy Policy: `https://api.boommall.app/legal/privacy`
- Terms: `https://api.boommall.app/legal/terms`
- ทั้งสอง URL ต้องเปิดได้จากเน็ตนอกก่อน submit และต้องใส่ใน App Store Connect ด้วย
- **ยังไม่มี ATT** — ใส่ `expo-tracking-transparency` ก่อนเปิดโฆษณาในฟีดเท่านั้น (Guideline 5.1.2)

## Release checklist

ก่อนกด `eas build`:

- [ ] `npx tsc --noEmit` และ `npm --prefix backend run typecheck` ผ่าน
- [ ] `npx vitest run` ผ่านทั้งหมด
- [ ] migration ขึ้น production แล้ว (`prisma:deploy`)
- [ ] env ฝั่ง production ครบ — รวม `FEED_CURSOR_SECRET`
- [ ] `STORE_COMPLIANCE_MODE = true` ใน `src/shared/compliance/appStoreGates.ts` (ปิด fake checkout / calls / LIVE / music upload)
- [ ] `UIBackgroundModes` มีแค่ `audio`
- [ ] Privacy + Terms URL เปิดได้จริง
- [ ] Apple Developer Program ยังไม่หมดอายุ

หลัง submit:

- [ ] กรอก What to Test
- [ ] วางเนื้อหาจาก `docs/app-store-review-notes.md` ลง App Review Information
- [ ] ยืนยันว่าบัญชีทดสอบ `apple-review@boommall.com` ล็อกอินได้จริงบนบิลด์นั้น
- [ ] Age rating ต้องสะท้อนว่ามี UGC + แชตเปิดสาธารณะ (ห้ามเลือกเรตเด็ก)

## รายการค้าง

- Associated domains + universal link สำหรับลิงก์แชร์
- ATT ก่อนเปิดโฆษณา
- App Store Connect API key (`.p8`) เพื่อ submit แบบไม่ต้องล็อกอินมือ — เก็บใน Secrets Manager แล้วอ้างใน CI
