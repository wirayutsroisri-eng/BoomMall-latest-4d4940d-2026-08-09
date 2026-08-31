# Cloud / AWS

เป้าหมาย: รองรับ Server + Database + Storage และขยายตามจำนวนผู้ใช้

## Inventory (อัปเดต 2026-08-31)
- AWS Account: **904425554651** (SSO IAM Identity Center — role `BoomMallDeploy`, user `boom`)
- Region: **ap-southeast-7**
- Compute: **ECS Fargate** — cluster `boommall-prod`, service `boommall-backend-service-wk51uui4`, task `boommall-backend:7` (512 vCPU / 1GB), port 4000
- Database: RDS PostgreSQL `database-1` (ดู `04_DATABASE.md`)
- Object Storage: S3 `boommall-media-prod` (ดู `05_STORAGE_MEDIA.md`)
- CDN: ยังไม่มี (บัญชียังไม่ verify CloudFront — ต้องติดต่อ AWS Support)
- DNS: **Cloudflare** (NS = `*.ns.cloudflare.com`) — ยังต้องเพิ่ม record `api` CNAME → ALB
  - Route 53 zone `boommall.app` มีอยู่แต่ไม่ใช่อำนาจจริง
- Load Balancer: **ALB `boommall-alb`** — `boommall-alb-1042244353.ap-southeast-7.elb.amazonaws.com`
  - Listener :443 HTTPS (ACM cert `api.boommall.app`, issued) → forward target group `boommall-backend-tg`
  - Listener :80 → forward (dev) + rule host `api.boommall.app` → redirect 301 HTTPS
- ECR: `boommall-backend`
- EC2: `boommall-backend-prod` (t3.micro, 43.209.12.204) — ดูเป็นเครื่องเก่า/ยังไม่ใช้สำหรับ API หลัก
- Logs: CloudWatch log group `/ecs/intrepid-service-s7p1z5`
- Secrets Manager: `rds!db-fa08c8fd-...` (DB), `boommall/backend/runtime` (ADMIN_API_KEY, JWT_SECRET)
- Backup: RDS automated + S3 (ยังไม่มี lifecycle)
- Monthly budget / Billing alerts: ยังไม่ได้ตั้ง

## API URLs
- Production (App Store/TestFlight): **`https://api.boommall.app`** (ต้องเพิ่ม DNS ที่ Cloudflare ก่อน)
- Dev (Expo Go): `http://boommall-alb-1042244353.ap-southeast-7.elb.amazonaws.com` (port 80)

## Security
ใช้ IAM least privilege + MFA และแยก Production access
- Task role `BoomMallBackendTaskRole` (S3 policy เท่านั้น)
- Exec role `ecsTaskExecutionRole`
- SG backend เปิด :4000 เฉพาะ ALB SG เท่านั้น (ไม่เปิดสาธารณะ)
- รายการค้าง: NAT gateway / private subnets ถ้าต้องการปิด public IP task
