# BoomMall Admin OS

React + Vite + Tailwind — หลังบ้านชุดเดียว แยกจากแอปมือถือ ที่ `http://localhost:5173/admin/`

แอป Expo เป็นฝั่งผู้ใช้/ร้านค้าเท่านั้น ไม่มีแผงแอดมินแพลตฟอร์มในแอป

## Run

```bash
cd backend && npm run dev          # :4000
cd admin && npm run dev            # :5173
```

เปิด [http://localhost:5173/admin/](http://localhost:5173/admin/) แล้วใส่ **รหัสแผนก** จาก `backend/.env`

## รหัสเข้าถึง

| Env | แผนก | เห็นอะไร |
|-----|--------|----------|
| `SUPER_ADMIN_API_KEY` | Super | ทั้งระบบ + emergency chat |
| `ADMIN_API_KEY` | แพลตฟอร์ม | ทุกแผนก ยกเว้น emergency |
| `ADMIN_KEY_SAFETY` | Safety | Safety / Users / Chat |
| `ADMIN_KEY_ADS` | Ads | Ads + ดันฟีดสินค้า |
| `ADMIN_KEY_FEED` | Feed | อัลกอริทึมฟีด |
| `ADMIN_KEY_MARKETPLACE` | ร้านค้า | Sellers / catalog |
| `ADMIN_KEY_FINANCE` | การเงิน | Coin / Top-up / Handbook |

รหัสเพิ่ม: `ADMIN_ACCESS_CODES='[{"key":"night","role":"SAFETY","label":"Safety กะดึก"}]'`

ไม่ใส่ env ของแผนกไหน = แผนกนั้นล็อกอินไม่ได้

## Safety Control Center

| Route | Page |
|-------|------|
| `/admin/safety` | Overview |
| `/admin/safety/reports` | User reports + merge to Case |
| `/admin/safety/cases` | Case management + AI recommend |
| `/admin/safety/users` | Lock/Unlock + Permanent Delete (advanced) |
| `/admin/safety/users/:id` | User Safety Profile + capabilities |
| `/admin/safety/content` | Flagged content queue |
| `/admin/safety/automod` | Automated moderation sliders |
| `/admin/safety/policy` | Policy versions + Thai prompt editor |
| `/admin/safety/blacklist` | Blocklist / Watchlist |
| `/admin/safety/appeals` | Appeals |
| `/admin/safety/audit` | Audit logs (read-only) |
| `/admin/safety/chat/*` | Chat Safety (nested) |

Legacy: `/admin/chat` → `/admin/safety/chat`, `/admin/moderation` → `/admin/safety`
