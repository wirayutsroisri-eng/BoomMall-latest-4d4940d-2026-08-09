@AGENTS.md

## AI Coding Rules

1. **ไม่แน่ใจให้ถามก่อน ห้ามเดา**
   หาก Requirement ไม่ชัด ข้อมูลไม่ครบ หรือมีหลายแนวทาง ให้ถามผู้ใช้ก่อน หรือเสนอทางเลือกให้ผู้ใช้ตัดสินใจ ห้ามเดาความต้องการเอง โดยเฉพาะสิ่งที่กระทบ Architecture, Database, API, Backend และ UI/UX

2. **เขียนและแก้เฉพาะเท่าที่จำเป็น**
   ใช้หลัก Minimal Change แก้เฉพาะส่วนที่จำเป็นต่อโจทย์ ห้าม Rewrite, Refactor, ย้ายไฟล์, เปลี่ยน Architecture หรือเพิ่ม Feature ที่ไม่ได้สั่งโดยไม่จำเป็น

3. **แตะเฉพาะจุดที่สั่ง**
   ก่อนแก้ให้ตรวจสอบ Dependency และผลกระทบต่อระบบเดิม รักษา API, Interface, Data Model, UI/UX และ Behavior เดิมที่ไม่เกี่ยวข้อง ห้ามแก้จุดหนึ่งแล้วทำให้ระบบส่วนอื่นเสีย

4. **กำหนด Definition of Done และทดสอบจนผ่าน**
   ก่อนเริ่มงานให้กำหนด Acceptance Criteria ที่ชัดเจน หลังแก้ต้อง Build/Test ส่วนที่เกี่ยวข้อง ตรวจสอบว่าไม่มี Error หรือ Crash ใหม่ และ Feature เดิมที่เกี่ยวข้องยังทำงาน ห้ามรายงานว่าเสร็จจนกว่าจะผ่านเกณฑ์

## Architecture Rules

เอกสารกลาง: **`ARCHITECTURE.md`** (source of truth ด้านสถาปัตยกรรม — technology stack, subsystem ownership, hybrid RN↔Swift bridge, data contracts, project map, build/test commands)

1. **AI ทุกตัวต้องอ่าน `ARCHITECTURE.md` ก่อนแก้โค้ด** — กฎนี้ใช้กับ Codex, Claude, Cursor, Gemini และโปรแกรมเมอร์ทุกคน
2. **ตรวจ subsystem ownership ก่อนลงมือ** — ดู section "System Ownership" ว่า feature นั้น owner อยู่ layer ไหน (React Native / Swift / Backend / Admin) แล้วแก้ที่ layer นั้นเท่านั้น
3. **ห้ามสร้าง feature ซ้ำอีก layer** — ถ้ามี implementation ที่ active อยู่แล้วใน layer หนึ่ง ห้ามสร้าง implementation ซ้ำในอีก layer (เช่น ห้ามทำ native Swift version ของฟีเจอร์ที่ RN เป็น owner อยู่แล้วโดยไม่ได้รับอนุญาต)
4. **ตรวจ implementation เดิมก่อนสร้างใหม่** — reuse component/module/store/bridge เดิมก่อน (`src/shared/`, `src/modules/`, `modules/native-media-editor/`)
5. **รักษา backward compatibility** — โดยเฉพาะ `OverlayObject`/`EditorMedia` contract, feed/chat schema, API routes; อย่าลบ legacy adapters
6. **ทำ TypeScript/test/build check ที่เกี่ยวข้องก่อนจบงาน** — `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build` (ดูคำสั่งจริงใน ARCHITECTURE.md section "Build / Test")
7. **ห้าม Commit / Push / Reset / Checkout / เปลี่ยน Branch เอง** — เว้นแต่ผู้ใช้สั่งอย่างชัดเจน
8. **ห้ามแก้ production code ในงาน documentation** — งานเอกสารต้องแก้เฉพาะเอกสาร/config guidance เท่านั้น
