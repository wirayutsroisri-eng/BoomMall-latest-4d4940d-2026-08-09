# Backup & Recovery

ต้องตอบให้ได้:
- Database backup อยู่ไหน?
- Media versioning/backup มีไหม?
- Source code recover จากไหน?
- Restore ใช้เวลาประมาณเท่าไร?
- ใคร/อะไรมีสิทธิ์ restore?

## Recovery Runbook
1. ระบุระบบที่เสีย
2. ป้องกันข้อมูลเสียเพิ่ม
3. เก็บ logs/evidence
4. เลือก restore point
5. Restore ใน isolated/staging ก่อนถ้าเป็นไปได้
6. Verify
7. เปิดบริการ
8. บันทึก Incident
