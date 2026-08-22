# START HERE — BoomMall System Handbook

## ใช้คู่มือนี้ทำอะไร
ใช้ตอบ 5 คำถาม:
1. ระบบนี้คืออะไร?
2. อยู่ที่ไหน?
3. ใช้บริการของใคร?
4. เชื่อมกับอะไร?
5. ถ้าพังต้องไปดูตรงไหน?

## Quick Map
| ระบบ | English | หน้าที่ | สถานะ |
|---|---|---|---|
| แอป | Mobile App | หน้าบ้านผู้ใช้ | ตรวจสอบ/อัปเดต |
| แบ็กเอนด์ | Backend API | กฎธุรกิจและ API | ตรวจสอบ/อัปเดต |
| ฐานข้อมูล | Database | ข้อมูลผู้ใช้/สินค้า/โพสต์/ออเดอร์ | ยังต้องระบุ Provider |
| ที่เก็บไฟล์ | Object Storage | รูป/วิดีโอ/ไฟล์ | ยังต้องระบุ Provider |
| แชต | Chat | ข้อความและห้องสนทนา | ระบบ BoomMall |
| โทร | Voice/Video Call | โทรเสียง/วิดีโอ | ตรวจ WebRTC stack |
| Feed | Feed | โพสต์และการเสิร์ฟคอนเทนต์ | ระบบ BoomMall |
| ร้านค้า | Commerce | ร้าน/สินค้า/SKU/ออเดอร์ | ระบบ BoomMall |
| Boom Coin | Internal Coin | Utility ภายในแพลตฟอร์ม | อยู่ระหว่างพัฒนา |
| Admin | Admin Console | จัดการระบบ/ผู้ใช้/คอนเทนต์ | ระบบ BoomMall |

## Environment
- Local = MacBook สำหรับพัฒนา
- Staging = ระบบทดสอบก่อน Production
- Production = ระบบผู้ใช้จริง

## กฎ
ข้อมูลที่ยังไม่ได้ตรวจจากโค้ดให้เขียนว่า **UNKNOWN / ต้องตรวจสอบ** ห้ามเดา
