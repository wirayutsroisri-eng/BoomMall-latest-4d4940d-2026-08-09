# AI Documentation Rules / กฎสำหรับ AI

AI ทุกตัวที่ทำงานกับ BoomMall ควรอ่านไฟล์นี้และ `00_START_HERE.md` ก่อนเปลี่ยน Architecture

## เมื่อเพิ่มระบบใหม่
1. ตรวจโค้ดจริงก่อน ห้ามเดา
2. เพิ่ม/แก้ Module ที่เกี่ยวข้อง
3. อัปเดต `02_SERVICE_REGISTRY.md`
4. อัปเดต `01_SYSTEM_ARCHITECTURE.md` ถ้า data flow เปลี่ยน
5. อัปเดต `23_CHANGELOG.md`
6. ระบุ Environment และ Provider
7. ระบุ Database/Storage/API/Queue ที่ระบบใช้
8. ระบุ Security, Backup, Monitoring และ Cost impact
9. ถ้าข้อมูลยังไม่ยืนยัน ให้เขียน `UNKNOWN / ต้องตรวจสอบ`
10. ห้ามบันทึก Password/API Key/Secret/Token/Private Key จริง

## เมื่อสร้างบริการเสริมใหม่
สร้างไฟล์ใน `modules/` ตาม template:
`modules/<ชื่อระบบ>.md`

จากนั้นเชื่อมกลับมาที่ Service Registry

## Definition of Done
งาน Architecture ยังไม่ถือว่าเสร็จ ถ้าโค้ดเปลี่ยนแต่เอกสารที่เกี่ยวข้องยังไม่อัปเดต
