# System Architecture / สถาปัตยกรรมระบบ

```text
BoomMall iOS App
       |
       v
Backend API + Authentication
  |       |        |        |
Database Storage  Chat    Feed/Commerce
  |       |        |        |
  +-------+--------+--------+
          |
 Admin / Jobs / Notifications
          |
 Voice-Video / AI / External Services
```

## หลักการ
- Database เก็บ structured data
- Object Storage เก็บ media/file
- Backend เป็นจุดควบคุม business logic
- Client ไม่ควรถือ privileged secrets
- แยก Local / Staging / Production
