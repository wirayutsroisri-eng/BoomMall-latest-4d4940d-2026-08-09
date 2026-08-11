# BoomMall · Boom Coin Admin Dashboard

React + Vite + Tailwind — base path **`/admin/`**

## Run

```bash
cd backend && npm run dev          # :4000
cd admin && npm install && npm run dev   # :5173
```

เปิด: [http://localhost:5173/admin/](http://localhost:5173/admin/)

| Route | หน้า |
|-------|------|
| `/admin/` | Dashboard (stats + top-up approve) |
| `/admin/handbook` | คู่มือระบบ Boom Coin (ADMIN only) |

Login ด้วย `ADMIN_API_KEY` จาก `backend/.env` (เช่น `dev-admin-key`)

## Handbook

- หมวด: Concept · Flywheel · Use-cases · Supply/Top-up · Security/Ledger
- ปุ่ม **🖨️ พิมพ์คู่มือ (Print PDF)** → ใช้ Print dialog ของเบราว์เซอร์ (Save as PDF)
- ตรวจสิทธิ์ซ้ำที่ `GET /api/v1/admin/handbook/access` (role = ADMIN)
