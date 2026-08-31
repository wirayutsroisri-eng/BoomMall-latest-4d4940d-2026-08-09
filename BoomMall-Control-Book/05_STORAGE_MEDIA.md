# Storage & Media / รูป วิดีโอ และไฟล์

ใช้เก็บ:
- รูปโปรไฟล์
- รูปโพสต์
- วิดีโอ Feed
- รูปสินค้า
- ไฟล์แนบ Chat
- Media ของ Editor

## สถานะจริง (อัปเดต 2026-08-31)
- Provider: **AWS S3**
- Bucket: **`boommall-media-prod`**
- Region: **ap-southeast-7**
- Public/Private policy: private + bucket policy อ่านสาธารณะเฉพาะ prefix `media/*` และ `chat-media/*` (S3 `GetObject` เท่านั้น) — ไฟล์ `backend/deploy/s3-public-media-policy.json`
- Block Public Access: ปิดแล้ว (จำเป็นสำหรับ policy) — ถ้าย้ายไป CloudFront ควรปิดคืน + ใส่ OAC
- CORS: อนุญาต `*` (ดู `backend/deploy/s3-cors.json`) — ควรจำกัดเป็น origin จริงก่อนขึ้น Store
- CDN: ยังไม่มี (บัญชียังไม่ verify CloudFront) — เตรียม config `cloudfront-media-distribution.json` + OAC ไว้แล้ว
- Upload flow: backend สร้าง **presigned PUT URL** (`media/{userId}/{assetId}/original.{ext}`) → client อัปโหลดตรง → backend ยืนยันด้วย `HeadObject`
- Media URL: `https://boommall-media-prod.s3.ap-southeast-7.amazonaws.com/{key}` (ยังไม่มี CDN_BASE_URL)
- Media validation: MIME whitelist (image/jpeg,png,webp,heic,heif / video/mp4,quicktime,m4v)
- Image resize / Video transcoding: ยังไม่มี
- Lifecycle/Delete: ยังไม่มี (ลบผ่าน backend `DeleteObject` เมื่อลบ post/asset)
- Backup/versioning: ยังไม่มี versioning

## Media Rule
Database เก็บ MediaAsset metadata/URL/key; binary file อยู่ Object Storage

## สิทธิ์
- Task role `BoomMallBackendTaskRole` → policy `BoomMallMediaS3Policy` (แนบแล้ว)
