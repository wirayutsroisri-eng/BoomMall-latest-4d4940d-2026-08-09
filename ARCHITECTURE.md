# BoomMall — Architecture Guide (Source of Truth)

> **อ่านก่อนแก้โค้ดทุกครั้ง** — เอกสารนี้คือ source of truth ด้านสถาปัตยกรรมของโปรเจกต์
> สำหรับ AI (Codex, Claude, Cursor, Gemini …) และโปรแกรมเมอร์ทุกคนที่เข้ามาทำงานต่อ
>
> สร้างจากผลการตรวจ repository จริง (commit `6b3e3e9` — workspace snapshot)
> จุดใดที่ไม่สามารถยืนยันได้จากโค้ด จะระบุเป็น **Needs verification**

---

## 1. Technology Stack

ข้อมูลด้านล่างยืนยันจาก `package.json`, `app.json`, `app.config.ts`, `modules/native-media-editor/ios/BoomMallNativeMediaEditor.podspec`, `backend/package.json`, `admin/package.json`

### Mobile App (React Native / Expo)

| เทคโนโลยี | เวอร์ชัน (จาก package.json) | ใช้ที่ไหน |
|---|---|---|
| React Native | `0.86.2` | พื้นฐานแอป |
| React | `19.2.3` | พื้นฐาน UI |
| Expo | `~57.0.11` (SDK 57) | toolchain, modules |
| expo-router | `~57.0.11` | File-based navigation (`app/`) |
| TypeScript | `~6.0.3` | ทั้งโปรเจกต์, `strict: true` |
| New Architecture | `newArchEnabled: true` (`app.json`) | RN Fabric / TurboModules |
| Zustand | `^5.0.14` | State management ฝั่ง RN |
| react-native-gesture-handler | `~2.32.0` | Gesture engine (UI thread + worklets) |
| react-native-reanimated | `4.5.1` | Animation / worklet-driven UI |
| react-native-worklets | `0.10.1` | Worklet runtime ของ Reanimated 4 |
| @shopify/react-native-skia | `2.6.2` | PhotoEditor: filter/color-matrix/brush/draw |
| @gorhom/bottom-sheet | `^5.2.14` | Bottom sheet UI |
| expo-video | `~57.0.2` | วิดีโอ (feed, preview) |
| expo-audio | `~57.0.3` | เสียง, background playback (`app.json` iOS `UIBackgroundModes: audio`) |
| expo-image-manipulator | `~57.0.8` | crop/resize/encode รูป |
| expo-image-picker / expo-camera / expo-media-library | SDK 57 | รับสื่อจากกล้อง/คลัง |
| expo-video-thumbnails | `~57.0.1` | สกัด first-frame thumbnail |
| expo-secure-store | `~57.0.1` | เก็บ session token |
| expo-sqlite | `~57.0.1` | Local DB (chat local cache — ดู `chatLocalDb.ts`) |
| @react-native-async-storage/async-storage | `2.2.0` | Persistence ของ Zustand stores |
| socket.io-client | `^4.8.1` | Realtime chat client |
| expo-dev-client | `~57.0.11` | Dev client (native modules ต้อง dev-client, ไม่อยู่ใน Expo Go) |

### Native iOS (Swift)

| เทคโนโลยี | ยืนยันจาก | รายละเอียด |
|---|---|---|
| Swift | `5.9` (podspec) | Native media editor module |
| iOS target | `16.4` (podspec), `supportsTablet: true` | Deployment target |
| Expo Modules Core | dependency ของ podspec | `NativeMediaEditorModule: Module` |
| UIKit | `ios/` files | `NativeMediaEditorViewController`, `MediaCanvas`, `TextOverlayView`, `GestureCoordinator`, `AlignmentGuideEngine`, `EditorToolbar`, `EditorSession` |
| AppDelegate | `ios/BoomMall/AppDelegate.swift` | subclass `ExpoAppDelegate` (prebuild-generated) |

> หมายเหตุ: `ios/` เป็นผลจาก `expo prebuild` (มี `Podfile`, `BoomMall.xcworkspace`, `Pods/`) — อย่าแก้ด้วยมือโดยไม่ผ่าน Expo config/app.json ยกเว้น native module ใหม่

### Backend

| เทคโนโลยี | เวอร์ชัน (backend/package.json) | ใช้ที่ไหน |
|---|---|---|
| Node.js + Express | Express `^5.1.0` | REST API (`backend/src/app.ts`) |
| TypeScript | `^5.9.2` | ทั้ง backend |
| Prisma | `^6.14.0` | ORM + migrations (`backend/prisma/`) |
| PostgreSQL | — (docker compose) | Database หลัก (durable store) |
| Socket.io | `^4.8.3` | Realtime chat (`backend/src/realtime/socket.gateway.ts`) |
| Redis | `^6.2.1` + `@socket.io/redis-adapter` | Socket.io scale / cache (optional) |
| zod | `^4.0.17` | Validation |
| jose | `^5.10.0` | JWT |
| @aws-sdk/client-s3 | `^3.1110.0` | Object storage (upload) |
| helmet / cors / morgan | — | Middleware |

### Admin Web (separate SPA)

| เทคโนโลยี | เวอร์ชัน (admin/package.json) |
|---|---|
| Vite | `^7.1.2` |
| React / React DOM | `^19.1.1` |
| react-router-dom | `^7.18.2` |
| Tailwind CSS | `^4.1.12` (@tailwindcss/vite) |
| TypeScript | `^5.9.2` |

### Testing / Quality

| เครื่องมือ | ใช้ที่ไหน |
|---|---|
| Vitest `^3.2.7` | `npm test` (root) — ครอบ `src/**/*.test.ts` + `backend/src/modules/ecommerce/**/*.test.ts` (ดู `vitest.config.ts`) |
| tsx | backend dev/scripts |
| eslint-config-expo | `expo lint` |
| EAS (`eas.json`) | Build/submit profiles: development, preview, play-internal, production |

---

## 2. System Ownership

กฎ: **feature ไหน owner อยู่ layer ไหน ให้แก้ที่ layer นั้น ห้ามสร้าง implementation ซ้ำในอีก layer**

### React Native / TypeScript (`src/` + `app/`) — owner

| Subsystem | ไฟล์หลัก (ยืนยันแล้ว) |
|---|---|
| Navigation / Router | `app/_layout.tsx`, `app/(tabs)/*`, `app/**` (expo-router) |
| Feed (Home, Reel, Comments, Board) | `src/modules/feed/` — `ui/HomeFeedScreen.tsx`, `ui/FeedReelCard.tsx`, `state/feed-store.ts`, `domain/types.ts` |
| Create / Publish flow (RN editor) | `src/modules/create/` — `editor/ui/PhotoEditorScreen.tsx`, `ui/TextStickerLayer.tsx`, `ui/ContentPreviewScreen.tsx`, `ui/ContentPublishScreen.tsx`, `state/create-draft-store.ts`, `data/persistCreateMedia.ts` |
| Text Overlay (RN) + gesture | `src/modules/create/ui/TextStickerLayer.tsx`, `TextStickerEditorOverlay.tsx`, `domain/overlay.ts`, `domain/overlayTextSticker.ts` |
| Chat (UI + store + local cache) | `src/modules/chat/` — `state/chat-store.ts`, `ui/ChatListScreen.tsx`, `data/chatRealtimeApi.ts`, `data/chatSocket.ts`, `data/chatLocalDb.ts`, `domain/types.ts` |
| Shop / Storefront | `src/modules/shop/` — `ui/ShopScreen.tsx`, `ui/ShopStorefrontScreen.tsx`, `ui/product/*` |
| Profile | `src/modules/profile/`, `src/modules/loyalty/state/loyalty-store.ts`, `app/profile/*` |
| Seller / Store / Warehouse / Finance UI | `src/modules/store/`, `src/modules/warehouse/`, `src/modules/commerce/` (domain + state), `app/store/*`, `app/products/*` |
| Auth / Session (client) | `src/modules/auth/state/auth-store.ts` (+ `src/shared/api/apiBase.ts`, `app/register.tsx`) |
| Vault / saved items (client) | `src/modules/vault/`, `src/modules/loyalty/` |
| Safety / Moderation (client) | `src/modules/safety/` — `state/moderation-store.ts`, `syncModerationContentBlocks.ts` |
| Search / Matching / Music / Knowledge / Social | `src/modules/search/`, `matching/`, `music/`, `knowledge/`, `social/`, `account/` |
| Shared infra | `src/shared/` — api, components (DragDownDismiss), media, native probe, theme, notifications, providers |
| App Store compliance gates | `src/shared/compliance/appStoreGates.ts` |

### Native iOS / Swift (`modules/native-media-editor/ios/`) — owner

| Subsystem | สถานะ | ไฟล์ |
|---|---|---|
| Native Media Editor (full-screen) | **experimental / feature-flagged OFF** (`EXPO_PUBLIC_NATIVE_MEDIA_EDITOR_ENABLED !== 'true'`) | `NativeMediaEditorModule.swift`, `NativeMediaEditorViewController.swift`, `EditorSession.swift`, `MediaCanvas.swift` |
| Native text overlay rendering | experimental | `TextOverlayView.swift`, `EditorModels.swift`, `NativeColor.swift` |
| Native gesture engine (drag/pinch/rotate) | experimental | `GestureCoordinator.swift`, `AlignmentGuideEngine.swift` |
| Native toolbar | experimental | `EditorToolbar.swift` |

> สรุป: **iOS native media editor ยังไม่ใช่ active path** — RN editor (`PhotoEditorScreen` + `TextStickerLayer`) คือ production path ปัจจุบัน (ดู §5)

### Backend (`backend/`) — owner

| Subsystem | ไฟล์หลัก |
|---|---|
| Auth & Profile (Apple/Google/FB/Phone/JWT, EULA) | `backend/src/modules/auth/` — `AuthService.ts`, `ProfileService.ts`, `JwtService.ts`, `AppleAuth.ts` |
| E-Commerce & Merchant (catalog, commerce, ads, promotions, GP ledger, PSP) | `backend/src/modules/ecommerce/` — `CatalogService.ts`, `CommerceService.ts`, `GpLedgerService.ts`, `AdInventoryService.ts`, `PspGateway.ts`, `SettlementService.ts` |
| Chat realtime + durability | `backend/src/modules/chat/` + `backend/src/realtime/socket.gateway.ts` + `ChatService.ts` (persist → Postgres) |
| Feed content (social posts, comments, personalization) | `backend/src/modules/feed/` — `ContentFeedService.ts`, `SocialPostService.ts`, `CommentService.ts` |
| Finance / Settlement (seller wallets, escrow, payout, tax) | `backend/src/modules/finance/` |
| Webboard / Push notify / Legal | `backend/src/modules/board/`, `notify/`, `legal/` |
| Admin API + moderation engine | `backend/src/routes/*`, `services/trustSafety/`, `modules/chat/http/routes.ts` (admin) |

### Admin Web (`admin/`) — owner

| Subsystem | ไฟล์ |
|---|---|
| Admin SPA (dashboard, users, sellers, moderation, chat ops, finance, content) | `admin/src/pages/*`, `admin/src/components/*`, `admin/src/lib/api.ts` |

---

## 3. Hybrid Architecture (React Native ↔ Native iOS)

### ของจริง (ยืนยันจากโค้ด)

มี native bridge เดียวในโปรเจกต์ตอนนี้: **BoomMallNativeMediaEditor** (Expo Module, iOS-only)

```
React Native (TypeScript)
  src/modules/create/ui/ContentPreviewScreen.tsx
    └─ calls openNativeMediaEditor(...)          ← src/modules/create/native/nativeMediaEditor.ts
         └─ requireOptionalNativeModule('BoomMallNativeMediaEditor')  ← bridge (TS → native)
              └─ nativeModule.openEditor(inputJSON: string): Promise<string>
                   └─ Expo Modules Core → NativeMediaEditorModule.swift
                        └─ JSONDecoder → NativeEditorInput (EditorModels.swift)
                             └─ NativeMediaEditorViewController present (full-screen)
                                  └─ onComplete → JSONEncoder → NativeEditorResult
                                       └─ resolve(json) → Promise<string>
                                            └─ JSON.parse → NativeMediaEditorResult (TS type)
                                                 └─ กลับเข้า React Native flow
```

**Bridge ไฟล์จริง:**
- Native ฝั่ง: `modules/native-media-editor/ios/NativeMediaEditorModule.swift` (`AsyncFunction("openEditor")`, `Name("BoomMallNativeMediaEditor")`)
- TS ฝั่ง: `src/modules/create/native/nativeMediaEditor.ts` (`NativeMediaEditorInput` / `NativeMediaEditorResult` types + `openNativeMediaEditor()`)
- ลงทะเบียน module: `modules/native-media-editor/expo-module.config.json` (`platforms: ["apple"]`)
- Podspec: `modules/native-media-editor/ios/BoomMallNativeMediaEditor.podspec`
- Feature gate: `EXPO_PUBLIC_NATIVE_MEDIA_EDITOR_ENABLED === 'true'` (default off) → `canOpenNativeMediaEditor()`

### กฎ
- **การข้าม React Native ↔ Native ต้องใช้ bridge/contract เดิมนี้** (`nativeMediaEditor.ts` ↔ `EditorModels.swift` JSON contract)
- ห้ามสร้าง native bridge ใหม่สำหรับ editor หรือ feature ที่มีอยู่แล้วโดยไม่ผ่าน ARCHITECTURE review
- Native module ต้อง `requireOptionalNativeModule` (safe) — แอปต้องไม่ crash ใน Expo Go (ดู `src/shared/native/expoNativeModules.ts` pattern)

---

## 4. Source of Truth

**ห้ามสร้าง source of truth ซ้ำ** — แต่ละข้อมูลมีเจ้าของเดียวตามตารางนี้

| ข้อมูล | Source of truth (ฝั่ง) | ไฟล์อ้างอิง |
|---|---|---|
| Auth / Session | Client: `useAuthStore` (SecureStore + AsyncStorage) — token จัดเก็บฝั่ง device; server ยืนยันด้วย JWT | `src/modules/auth/state/auth-store.ts`, `backend/src/modules/auth/JwtService.ts` |
| Feed posts / comments / likes | Server (PostgreSQL via Prisma) → sync ไป client store | `backend/src/modules/feed/`, `src/modules/feed/data/feedEngageApi.ts`, `src/modules/feed/state/feed-store.ts` (client cache + optimistic) |
| Chat messages / conversations | Server (PostgreSQL — durable) + client local cache (`expo-sqlite`) สำหรับ offline; realtime ผ่าน Socket.io | `backend/src/realtime/socket.gateway.ts`, `backend/src/modules/chat/services/ChatService.ts`, `src/modules/chat/state/chat-store.ts`, `src/modules/chat/data/chatLocalDb.ts` |
| Create draft / editor composition (ยังไม่ publish) | Client in-memory `useCreateDraftStore` (ไม่ persist) — บังคับให้ flow editor→preview→publish ผ่าน store เดียว | `src/modules/create/state/create-draft-store.ts` |
| Media file (picked/captured) | Client document dir — `persistCreateMedia()` คัดลอกไฟล์ก่อน publish | `src/modules/create/data/persistCreateMedia.ts`, `src/shared/media/` |
| Media URL (published) | Server / object storage (S3) — `uploadFeedMedia` / chat media upload | `src/modules/feed/data/uploadFeedMedia.ts`, `src/modules/chat/data/chatMedia.ts` |
| Overlay / composition state | Client — `OverlayObject[]` ใน draft store แล้วส่งต่อ (JSON) ไปยัง publish/feed | `src/modules/create/domain/editorComposition.ts`, `src/modules/create/state/create-draft-store.ts` |
| Profile (displayName, handle, avatar…) | Client-first: `useLoyaltyStore` (AsyncStorage persist) + `hydrateOwnProfileFromServer` | `src/modules/loyalty/state/loyalty-store.ts`, `src/modules/profile/data/syncOwnProfile.ts`; server DTO: `backend/src/modules/auth/ProfileService.ts` (`ProfileDto`) |
| Product catalog / inventory / stock | Client: `useInventoryStore` (Zustand + AsyncStorage) sync กับ server catalog API | `src/modules/commerce/state/inventory-store.ts`, `src/modules/commerce/data/commerceSync.ts`, `backend/src/modules/ecommerce/` |
| Moderation / safety policy | Server (Prisma `ModerationPolicy`, `ModerationState`) + client block list sync | `backend/src/services/trustSafety/`, `src/modules/safety/` |
| Compliance gates (App Store) | Client compile-time flags | `src/shared/compliance/appStoreGates.ts` |

> กฎง่าย ๆ: ถ้าข้อมูลต้องอยู่รอดข้ามเครื่อง/เซสชัน → server (PostgreSQL) เป็น source of truth; ถ้าเป็น ephemeral editing state → client store เดียวที่กำหนด; ถ้าเป็น device-private secret → SecureStore

---

## 5. Media Editor Architecture

### สถานะจริง (ยืนยันจากโค้ด)

| องค์ประกอบ | ฝั่ง / ไฟล์ | สถานะ |
|---|---|---|
| **Editor หลัก (photo filters / draw / crop)** | RN: `src/modules/create/editor/ui/PhotoEditorScreen.tsx` (Skia: `Canvas` + `ColorMatrix`, brush/path) + `CropStudioScreen.tsx` | **Active (production path)** |
| **Native Editor (full-screen, iOS)** | Swift: `modules/native-media-editor/ios/` (`NativeMediaEditorViewController` + `MediaCanvas` + `EditorToolbar`) | **Experimental / migration** — off by default (`EXPO_PUBLIC_NATIVE_MEDIA_EDITOR_ENABLED`), เข้าถึงจาก `ContentPreviewScreen` เมื่อ flag + module มีจริง |
| **Text Overlay** | RN: `src/modules/create/ui/TextStickerLayer.tsx` (gesture: drag/pinch/rotate via RNGH+Reanimated), `TextStickerEditorOverlay.tsx`, `TextOverlayRenderer.tsx`, `LockedOverlayText.tsx`, `LockedTextStickerLayer.tsx` | **Active** |
| **Native Text Overlay** | Swift: `TextOverlayView.swift` | Experimental |
| **Gesture engine (overlay)** | RN: `react-native-gesture-handler` + `react-native-reanimated` (ดู `TextStickerLayer.tsx`) | Active (RN) |
| **Native gesture engine** | Swift: `GestureCoordinator.swift`, `AlignmentGuideEngine.swift` | Experimental |
| **Preview** | RN: `src/modules/create/ui/ContentPreviewScreen.tsx` (ยังเป็น entry ที่เรียก native editor ได้) | Active |
| **Publish** | RN: `src/modules/create/ui/ContentPublishScreen.tsx` → `publishSocialPost` → `uploadFeedMedia` | Active |
| **Feed renderer** | RN: `src/modules/feed/ui/FeedReelCard.tsx` + `FeedMediaRenderer.tsx` + `Locked*` overlay components | Active (RN render overlays แบบ locked ใน feed) |

### Data contract (สำคัญที่สุด)

`OverlayObject`/`EditorMedia` ถูกประกาศที่ **`src/modules/create/domain/editorComposition.ts`** — เป็น canonical contract ระหว่าง editor ↔ preview ↔ publish ↔ feed ↔ native editor

- `OverlayTransform` (normalized 0–1, `{x, y, scale, rotation}`): `src/modules/create/domain/overlay.ts`
- `OverlayTextSticker`: `src/modules/create/domain/overlayTextSticker.ts`
- `OverlayFontKey`: `src/modules/create/domain/overlayText.ts`
- Native mirror (JSON ผ่าน bridge): `modules/native-media-editor/ios/EditorModels.swift` (`NativeOverlay`, `NativeOverlayTransform`, `NativeTextStyle`)

> ⚠️ ถ้าแก้ `OverlayObject` ฝั่ง TS ต้องแก้ `EditorModels.swift` ฝั่ง Swift ให้ตรงกัน และตรงข้ามด้วย — contract นี้ผูกสอง layer

---

## 6. Data Contracts (Types ที่สำคัญ)

| Model | ไฟล์จริงที่ประกาศ type |
|---|---|
| `EditorMedia`, `TextOverlayObject`, `StickerOverlayObject`, `OverlayObject` | `src/modules/create/domain/editorComposition.ts` |
| `OverlayTransform`, `DEFAULT_OVERLAY_TRANSFORM` | `src/modules/create/domain/overlay.ts` |
| `OverlayTextSticker`, `OverlayTextStyle`, `OverlayFontKey` | `src/modules/create/domain/overlayTextSticker.ts`, `src/modules/create/domain/overlayText.ts` |
| `FeedItem`, `FeedComment`, `FeedProduct`, `FeedTab`, `BoardSide`, `CommerceTier` | `src/modules/feed/domain/types.ts` |
| `ChatMessage`, `Conversation`, `MessageKind`, `ProductCard`, `QuotationCard`, `ContentReferenceCard`, `JobMatchCard`, `OrderSnapshotCard` | `src/modules/chat/domain/types.ts` |
| `ChatAttachmentLike` → message fields | `src/modules/chat/domain/chat-media.ts` |
| `AuthUser`, `SocialProvider`, `AuthState` | `src/modules/auth/state/auth-store.ts` |
| `VipProfile` (profile/loyalty) | `src/modules/knowledge/domain/types.ts` (ใช้ใน `loyalty-store.ts`) |
| `MasterSku`, `SkuVariant`, `WarehouseStock`, `ProductMediaItem`, `WarehouseId`, `CustomFieldDef/Value` | `src/modules/commerce/domain/types.ts` |
| Product media rules (max 6, video 200MB, thumbnail) | `src/modules/commerce/domain/product-media.ts` |
| `GallerySlide`, format helpers (THB) | `src/modules/shop/domain/product-display.ts` |
| `NativeEditorInput`, `NativeEditorResult`, `NativeOverlay` (Swift Codable) | `modules/native-media-editor/ios/EditorModels.swift` |
| `NativeMediaEditorInput/Result` (TS mirror) | `src/modules/create/native/nativeMediaEditor.ts` |
| DB models (Wallet, LedgerEntry, ModerationPolicy, Chat, …) | `backend/prisma/schema.prisma` |
| `ProfileDto`, `ProfilePrivacy` (server) | `backend/src/modules/auth/ProfileService.ts` |

---

## 7. Rules for Future Development

1. **ก่อนแก้ feature ตรวจ subsystem owner ก่อน** — ดู §2 ว่า subsystem นั้น owner อยู่ layer ไหน แล้วแก้ที่ layer นั้น
2. **ห้ามสร้าง implementation ซ้ำใน TypeScript และ Swift** — ถ้ามี RN implementation ที่ active อยู่แล้ว ห้ามทำ native version ซ้ำ (ยกเว้นผ่าน process ใน §10/ADR)
3. **ห้ามย้าย ownership ข้าม layer โดยไม่อัปเดต ARCHITECTURE.md นี้** (และบันทึก ADR)
4. **ถ้าต้องข้าม React Native ↔ Native ให้ใช้ bridge/contract เดิม** — `nativeMediaEditor.ts` ↔ `EditorModels.swift`; ห้ามสร้าง bridge คู่ขนาน
5. **reuse component/module เดิมก่อนสร้างใหม่** — ตรวจ `src/shared/` และ `src/modules/` ก่อน
6. **ห้าม rewrite ระบบใหญ่โดยไม่จำเป็น** — หลัก Minimal Change (ตรงกับ CLAUDE.md rule #2)
7. **performance-critical feature ให้ประเมิน native implementation ก่อนตัดสินใจ** — แต่ native ≠ default; ต้องมีเหตุผล measurable และผ่าน ADR
8. **backward compatibility ต้องได้รับการรักษา** — โดยเฉพาะ `OverlayObject` contract, feed item schema, chat message schema, API routes; legacy adapters ใน `editorComposition.ts` (`legacyTextOverlaysForMedia`) ห้ามลบ
9. **ห้ามแก้ production code ในงานเอกสาร** — งานนี้ documentation-only
10. **ไม่แน่ใจให้ถามก่อน** — ห้ามเดา (ตรงกับ CLAUDE.md rule #1)

---

## 8. Project Map (เฉพาะไฟล์ที่ architecture สำคัญ)

```
BoomMall/
├── app/                          # expo-router screens (file-based navigation)
│   ├── _layout.tsx               # Root Stack + modal options (DragDownDismiss)
│   ├── (tabs)/                   # Main tabs: index(Feed) · chat · create · shop · profile
│   ├── create-*.tsx              # create-hub · capture · crop · editor · preview · publish · details
│   ├── shop/ · store/ · products/  # commerce routes
│   ├── profile/ · settings/ · wallet/ · vault/ · orders/ · search/ · qr-scan/
├── src/
│   ├── modules/                  # feature modules (ดู §2)
│   │   ├── create/               # editor + overlay + publish flow
│   │   │   ├── editor/ui/PhotoEditorScreen.tsx   # RN editor (Skia) — ACTIVE
│   │   │   ├── ui/TextStickerLayer.tsx           # RN text overlay gesture — ACTIVE
│   │   │   ├── native/nativeMediaEditor.ts       # TS↔Swift bridge wrapper
│   │   │   ├── domain/editorComposition.ts       # ⭐ OverlayObject contract
│   │   │   ├── state/create-draft-store.ts       # draft source of truth (client)
│   │   │   └── data/persistCreateMedia.ts        # copy media to document dir
│   │   ├── feed/                 # feed-store.ts · domain/types.ts · ui/FeedReelCard.tsx
│   │   ├── chat/                 # chat-store.ts · chatRealtimeApi.ts · chatLocalDb.ts · domain/types.ts
│   │   ├── commerce/             # inventory-store.ts · domain/types.ts · product-media.ts
│   │   ├── shop/ · store/ · warehouse/ · profile/ · auth/ · wallet/ · vault/
│   │   └── safety/ · matching/ · music/ · knowledge/ · social/ · search/ · loyalty/ · account/
│   └── shared/
│       ├── components/           # DragDownDismiss · MainTabBar · AppPrompt …
│       ├── media/                # picker pipeline · gallery · thumbnails
│       ├── native/expoNativeModules.ts   # safe native module probing
│       ├── compliance/appStoreGates.ts   # App Store compliance flags
│       ├── api/apiBase.ts        # resolve API origin
│       └── theme/ · providers/ · state/ · notifications/ · navigation/ · legal/
├── modules/
│   └── native-media-editor/      # ⭐ Local Expo module (iOS/Swift) — experimental
│       ├── expo-module.config.json
│       └── ios/                  # NativeMediaEditorModule.swift · EditorModels.swift
│                                 # NativeMediaEditorViewController.swift · MediaCanvas.swift
│                                 # TextOverlayView.swift · GestureCoordinator.swift · EditorToolbar.swift
├── ios/                          # prebuild-generated Xcode project (อย่าแก้มือ)
├── backend/                      # Express + Prisma + Postgres + Socket.io
│   ├── src/app.ts · index.ts
│   ├── src/realtime/socket.gateway.ts   # ⭐ Socket.io gateway (chat realtime)
│   ├── src/modules/{auth,ecommerce,chat,feed,finance,board,notify,legal}/
│   ├── prisma/schema.prisma + migrations/
│   └── docker-compose.yml        # Postgres + PgAdmin (on-prem)
├── admin/                        # Vite + React admin SPA (separate)
├── scripts/seller-warehouse-tests.ts   # standalone logic tests (node/tsx)
├── docs/                         # app-store-review-notes.md · play-store-testing.md
├── app.json · app.config.ts · eas.json · package.json · tsconfig.json · vitest.config.ts
├── AGENTS.md · CLAUDE.md · ARCHITECTURE.md
└── .cursorrules · .cursor/rules/        # iron rules (confirm-before-delete, drag-down-dismiss, app-store-compliance)
```

---

## 9. Build / Test (คำสั่งจริง — จาก package.json / eas.json / vitest.config.ts)

### Root (mobile app)

| งาน | คำสั่ง |
|---|---|
| Install | `npm install` (หรือ `npm ci` จาก package-lock.json) |
| เริ่ม Expo dev server | `npm start` (`expo start`) |
| iOS dev build (native module) | `npm run ios` (`expo run:ios`) |
| Android | `npm run android` |
| Web | `npm run web` |
| Prebuild | `npm run prebuild` (`expo prebuild`) |
| Lint | `npm run lint` (`expo lint`) |
| Test (Vitest) | `npm test` (`vitest run`) / `npm run test:watch` |
| TypeScript check | `npx tsc --noEmit` (root tsconfig, strict) |
| Backend dev server | `npm run api` (= `npm run dev --prefix backend`) |
| EAS build | `npx eas build --profile development` / `--profile preview` / `--profile production` |

### Backend (`backend/`)

| งาน | คำสั่ง |
|---|---|
| Dev | `npm run dev` (`tsx watch src/index.ts`) |
| Build | `npm run build` |
| Start (prod) | `npm run start:prod` (migrate-deploy + node dist/index.js) |
| Typecheck | `npm run typecheck` |
| Prisma generate/migrate | `npm run prisma:generate` / `prisma:migrate` / `prisma:deploy` |
| Seed / reset | `npm run db:seed` / `db:reset` |
| DB up | `npm run db:up` (docker compose) |
| Backup | `npm run db:backup` |

### Admin (`admin/`)

| งาน | คำสั่ง |
|---|---|
| Dev | `npm run dev` (vite) |
| Build | `npm run build` |
| Typecheck | `npm run typecheck` |

### Scripts

| งาน | คำสั่ง |
|---|---|
| Seller warehouse logic tests | `npx tsx scripts/seller-warehouse-tests.ts` |

> หมายเหตุ: vitest ครอบเฉพาะ `src/**/*.test.ts` และ `backend/src/modules/ecommerce/**/*.test.ts` (จาก `vitest.config.ts`); ไฟล์จริงที่พบ: `backend/src/modules/ecommerce/inventory/stockMath.test.ts`

---

## 10. Architecture Decisions (ADR)

บันทึกเฉพาะ decision ที่ **ยืนยันจาก codebase / เอกสารที่มีอยู่จริง** (ยังไม่มีระบบ ADR เดิม — section นี้เป็นจุดเริ่ม)

| # | Decision | ยืนยันจาก |
|---|---|---|
| ADR-001 | React Native/TypeScript เป็น owner ของ production UI ทั้งหมด (feed, chat, shop, profile, create/publish) | `src/modules/*`, `app/*` |
| ADR-002 | Native iOS (Swift) มีอยู่เฉพาะ `BoomMallNativeMediaEditor` และเป็น **experimental/feature-flagged** (default off) — ไม่ใช่ active path | `src/modules/create/native/nativeMediaEditor.ts` (`EXPO_PUBLIC_NATIVE_MEDIA_EDITOR_ENABLED`), `expo-module.config.json` |
| ADR-003 | `OverlayObject`/`EditorMedia` contract อยู่ที่ `src/modules/create/domain/editorComposition.ts` และเป็น canonical ระหว่าง TS กับ Swift (JSON bridge) | `editorComposition.ts`, `EditorModels.swift` |
| ADR-004 | Chat ใช้ Socket.io สำหรับ realtime แต่ **persist ผ่าน Chat API → PostgreSQL** (ไม่ใช่ source of truth ใน memory) | `backend/src/realtime/socket.gateway.ts` (header comment), `backend/src/modules/chat/services/ChatService.ts` |
| ADR-006 | App Store compliance ควบคุมด้วย compile-time flags (`STORE_COMPLIANCE_MODE = true`) — calls, music upload และ fake checkout ถูกตัดออกจาก iOS build | `src/shared/compliance/appStoreGates.ts`, `.cursor/rules/app-store-compliance.mdc` |
| ADR-007 | UI ทุกตัวที่ปิดได้ต้องปิดด้วย drag-down (ไม่ใช่แค่ X) — `DragDownDismiss` / `dismissibleModalOptions` | `src/shared/components/DragDownDismiss.tsx`, `app/_layout.tsx`, `.cursor/rules/drag-down-dismiss.mdc` |
| ADR-008 | การลบข้อมูลผู้ใช้ต้องยืนยันก่อน (`Alert.alert` ยกเลิก + ลบ) — ห้ามลบใน tap แรก | `.cursor/rules/confirm-before-delete.mdc` (เห็นใน chat/feed delete flows) |

### การเพิ่ม ADR ใหม่ในอนาคต

เมื่อมีการตัดสินใจทางสถาปัตยกรรม (ย้าย ownership, เพิ่ม native module, เปลี่ยน contract) ให้เพิ่มรายการในตารางนี้พร้อม: วันที่ · ผู้ตัดสินใจ · ปัญหา · ทางเลือกที่พิจารณา · เหตุผล · ผลกระทบต่อ backward compatibility

---

## Needs verification (จุดที่ยังไม่ยืนยัน)

- **Root `README.md` ไม่มีใน repository** — สร้างขึ้นใหม่ในงานนี้เพื่อชี้ไปยัง ARCHITECTURE.md / CLAUDE.md (verify: ควรมี README จริงตาม product ทีมต้องการหรือไม่)
- `ios/BoomMall 2/` และ `BoomMallSellerKit/` — มีใน folder แต่ยังไม่ได้ inspect ว่าเป็น target ไหน / ใช้งานหรือไม่ (**Needs verification**)
- `admin/` เชื่อมกับ backend ผ่าน API ใดบ้าง — เห็น `lib/api.ts`, `chatApi.ts`, `feedApi.ts`, `promoApi.ts`, `safetyApi.ts` แต่ endpoint mapping เต็มยังไม่ได้จับคู่ทีละ route
- `expo-sqlite` ใช้ใน chat local cache (`chatLocalDb.ts`) จริง แต่ยังไม่ได้ map schema ตารางทั้งหมด
- Native media editor ยังไม่ได้รัน QA บน device จริง — สถานะ "experimental" อิงจาก flag + comment ในโค้ด (`nativeMediaEditor.ts` ระบุ "Off by default until native-device QA is complete")
- Backend chat migration ยังมี `mongoDeferred: true` (จาก `backend/src/modules/index.ts`) — หมายความว่ามีแผน MongoDB ในอนาคตแต่ยังไม่ active (**Needs verification**)
- `dist/` ที่ root มี build output — ยังไม่ได้ตรวจว่ามาจากอะไร
