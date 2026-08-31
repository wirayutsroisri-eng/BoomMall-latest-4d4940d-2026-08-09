# Database / ฐานข้อมูล

ใช้เก็บ: User, Profile, Shop, Product, SKU, Order, Post metadata, Chat metadata, Wallet ledger และข้อมูลธุรกิจอื่น

## สถานะจริง (อัปเดต 2026-08-31)
- Provider: **AWS RDS** (PostgreSQL)
- Engine: **PostgreSQL 17.11** (`database-1`)
- Region: **ap-southeast-7**
- Endpoint: `database-1.ct4qm4eualal.ap-southeast-7.rds.amazonaws.com:5432`
- Database name: `boommall` (schema `public`)
- Production/Staging: มีแค่ production (ยังไม่มี staging)
- Multi-AZ: ❌ (ยังไม่มี) — ควรเปิดก่อน scale
- Storage: gp3 20GB
- Public access: ❌ ปิด (private, ผ่าน SG `boommall-db-sg` → อนุญาตเฉพาะ `boommall-backend-sg`)
- SSL: `sslmode=require`
- Backup policy: RDS automated backup (ค่าเริ่มต้น)
- Retention: ตามค่าเริ่มต้น RDS (7 วัน)
- Encryption: RDS default encryption
- Migration system: Prisma (`prisma migrate deploy` รันอัตโนมัติตอน ECS start)
- Connection secret location: **AWS Secrets Manager** — `rds!db-fa08c8fd-2d88-40e2-b488-eb564ec4b655` (RDS-managed, rotation เปิด) + runtime keys ใน `boommall/backend/runtime`

## ⚠️ ข้อควรระวัง
- Secret RDS มีสภาพ rotation ค้าง (AWSCURRENT+AWSPENDING) ตรวจวันที่ rotation ถัดไป (กำหนด 6 ก.ย.) — ถ้า fail จะเกิด DB auth error ซ้ำ
- Task role ของ ECS ใช้ secret อัตโนมัติ ถ้า secret เปลี่ยน ต้อง `--force-new-deployment`

## ห้าม
- ห้ามเก็บ password แบบ plain text
- ห้ามใส่ database password ในเอกสาร
