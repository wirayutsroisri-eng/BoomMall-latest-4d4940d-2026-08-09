# BoomMall — Google Play Internal testing

ใช้กับ Play Console → Testing → Internal testing  
แพ็กเกจ: `com.boommall.superapp` · version `1.0.0` (versionCode เริ่ม 1, EAS autoIncrement)

## สิ่งที่บิลด์นี้เป็น

โซเชียลมาร์เก็ตเพลส: ฟีด แชต ร้านค้า คลังผู้ขาย  
ชำระเงินสินค้า **ยังไม่ยืนยันสำเร็จ** จนกว่ามี PSP  
Boom Coin / ทิป / เติม / คอล / อัปโหลดเพลง / LIVE **ไม่ได้ ship**  
โฆษณาเก็บเงินสู่ผู้ใช้ไทย **ยังไม่เปิด** — ยังไม่มี KYC ผู้ลงแอดตามมาตรการ คธอ. ฉบับที่ 2

## บัญชีทดสอบ

- อีเมล: `apple-review@boommall.com`
- รหัส: `Password1234`
- ลบบัญชี: โปรไฟล์ → ตั้งค่า → ลบบัญชีและข้อมูลทั้งหมด
- รายงาน/บล็อก: กดค้างคลิปหรือเมนูแชต
- Privacy: `https://<API>/legal/privacy` · Terms: `https://<API>/legal/terms`

API สร้างบัญชีนี้ตอนบูต (และสร้างใหม่ถ้าถูกลบ)

## ก่อนบิลด์

1. ใส่ `EXPO_PUBLIC_API_URL` จริง (HTTPS) ใน `eas.json` โปรไฟล์ `play-internal`
2. โฮสต์ Privacy Policy + Terms แล้ววางลิงก์ใน Play Console (Store listing + App content)
3. Data safety: บัญชี, เนื้อหาผู้ใช้, ตัวระบุอุปกรณ์ — **ไม่ติดตามโฆษณา** ในบิลด์นี้
4. Age: ไม่ใช่ Kids · มีแชต/โพสต์ UGC
5. หมวดหมู่: Shopping หรือ Social ตามที่เลือกใน Console

## คำสั่ง

```bash
npx eas login
npx eas build --platform android --profile play-internal
npx eas submit --platform android --profile play-internal --latest
```

หรืออัปโหลดไฟล์ `.aab` จาก EAS เข้า Internal testing ด้วยมือ

## Play Console — App content

- Privacy policy: URL สาธารณะ
- Ads: ไม่แสดงโฆษณาในบิลด์ทดสอบนี้ (หรือเลือก No)
- UGC: Yes — มีรายงาน บล็อก และทีมตรวจสอบในแอดมิน
- Target audience: 18+
- Data safety: ตรงกับที่แอปเก็บจริง
- Government apps: No
