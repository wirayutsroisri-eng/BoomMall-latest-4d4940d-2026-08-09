/** Public Privacy Policy + Terms — English first so App Review can read them. */

export type LegalDocKey = 'privacy' | 'terms';

export type LegalDoc = {
  key: LegalDocKey;
  titleEn: string;
  titleTh: string;
  updated: string;
  sections: Array<{ headingEn: string; headingTh: string; bodyEn: string; bodyTh: string }>;
};

export const LEGAL_UPDATED = '17 August 2026';

export const PRIVACY_DOC: LegalDoc = {
  key: 'privacy',
  titleEn: 'Privacy Policy',
  titleTh: 'นโยบายความเป็นส่วนตัว',
  updated: LEGAL_UPDATED,
  sections: [
    {
      headingEn: '1. Who we are',
      headingTh: '1. ผู้ให้บริการ',
      bodyEn:
        'BoomMall is a social marketplace app (feed, chat, shop listings, seller tools). This policy describes personal data we process when you create an account and use the app. Contact: privacy@boommall.app',
      bodyTh:
        'BoomMall เป็นแอปตลาดโซเชียล (ฟีด แชต ร้านค้า เครื่องมือผู้ขาย) นโยบายนี้บอกข้อมูลส่วนบุคคลที่เราประมวลผลเมื่อคุณสมัครและใช้แอป ติดต่อ: privacy@boommall.app',
    },
    {
      headingEn: '2. Data we collect',
      headingTh: '2. ข้อมูลที่เราเก็บ',
      bodyEn:
        'Account data (display name, handle, email if you register with email, Sign in with Apple / Google identifiers). User-generated content (posts, comments, chat messages, product listings you create). Device data needed to run the app (crash/session as processed by the OS). Reports you submit for safety. We do not sell personal data to third parties for advertising. This build does not use App Tracking Transparency tracking.',
      bodyTh:
        'ข้อมูลบัญชี (ชื่อที่แสดง, แฮนเดิล, อีเมลถ้าสมัครด้วยอีเมล, รหัสจาก Sign in with Apple / Google) เนื้อหาที่คุณสร้าง (โพสต์ คอมเมนต์ แชต สินค้า) ข้อมูลอุปกรณ์ที่จำเป็นต่อการทำงานของแอป และรายงานความปลอดภัย เราไม่ขายข้อมูลส่วนบุคคลเพื่อโฆษณา บิลด์นี้ไม่ใช้การติดตามแบบ ATT',
    },
    {
      headingEn: '3. How we use data',
      headingTh: '3. วัตถุประสงค์การใช้',
      bodyEn:
        'To provide login, feed, chat, marketplace, warehouse tools, and community moderation (report, block, takedown). To issue a session token after we verify your provider token or password. To contact you about your account or legal requests.',
      bodyTh:
        'เพื่อให้บริการล็อกอิน ฟีด แชต ตลาด คลังสินค้า และการกลั่นกรองชุมชน (รายงาน บล็อก ลบเนื้อหา) เพื่อออกเซสชันหลังตรวจโทเคนผู้ให้บริการหรือรหัสผ่าน และติดต่อเรื่องบัญชีหรือคำขอตามกฎหมาย',
    },
    {
      headingEn: '4. Device permissions',
      headingTh: '4. สิทธิ์บนอุปกรณ์',
      bodyEn:
        'Camera, microphone, and photo library are requested only when you use the related feature (capture or attach media). Face ID is used only if you enable device unlock for account security on this device.',
      bodyTh:
        'กล้อง ไมโครโฟน และคลังภาพถูกขอเฉพาะเมื่อคุณใช้ฟีเจอร์นั้น (ถ่ายหรือแนบสื่อ) Face ID ใช้เมื่อคุณเปิดปลดล็อกความปลอดภัยบนเครื่องนี้',
    },
    {
      headingEn: '5. Account deletion',
      headingTh: '5. การลบบัญชี',
      bodyEn:
        'You can delete your account and associated personal data in the app: Profile → Settings → Delete account and all data. We remove your profile, login identities, follows, posts, comments, likes, board posts, push devices, and chat membership. We may retain limited transaction records if required by Thai tax or payment law. After deletion you cannot recover the account.',
      bodyTh:
        'คุณลบบัญชีและข้อมูลส่วนบุคคลที่เกี่ยวข้องได้ในแอป: โปรไฟล์ → ตั้งค่า → ลบบัญชีและข้อมูลทั้งหมด เราลบโปรไฟล์ ตัวตนล็อกอิน การติดตาม โพสต์ คอมเมนต์ ไลค์ บอร์ด อุปกรณ์แจ้งเตือน และสมาชิกแชต อาจเก็บหลักฐานรายการค้าบางส่วนหากกฎหมายภาษีหรือการชำระเงินของไทยกำหนด หลังลบแล้วกู้คืนไม่ได้',
    },
    {
      headingEn: '6. Sharing',
      headingTh: '6. การเปิดเผย',
      bodyEn:
        'We share data with infrastructure providers (hosting, email login verification with Apple/Google) only as needed to run the service, and with authorities when legally required. We do not sell your data.',
      bodyTh:
        'เราเปิดเผยข้อมูลกับผู้ให้บริการโครงสร้างพื้นฐาน (โฮสต์, ตรวจโทเคนกับ Apple/Google) เท่าที่จำเป็นในการให้บริการ และกับหน่วยงานเมื่อกฎหมายบังคับ เราไม่ขายข้อมูลของคุณ',
    },
    {
      headingEn: '7. Contact',
      headingTh: '7. ติดต่อ',
      bodyEn: 'Privacy questions: privacy@boommall.app',
      bodyTh: 'สอบถามความเป็นส่วนตัว: privacy@boommall.app',
    },
  ],
};

export const TERMS_DOC: LegalDoc = {
  key: 'terms',
  titleEn: 'Terms of Use (EULA)',
  titleTh: 'ข้อกำหนดการใช้บริการ (EULA)',
  updated: LEGAL_UPDATED,
  sections: [
    {
      headingEn: '1. Acceptance',
      headingTh: '1. การยอมรับข้อกำหนด',
      bodyEn:
        'By creating a BoomMall account or using the app you agree to these Terms and the Privacy Policy. If you do not agree, do not use the app. Contact: legal@boommall.app',
      bodyTh:
        'การสมัครหรือใช้ BoomMall ถือว่าคุณยอมรับข้อกำหนดนี้และนโยบายความเป็นส่วนตัว หากไม่ยอมรับโปรดหยุดใช้แอป ติดต่อ: legal@boommall.app',
    },
    {
      headingEn: '2. Accounts',
      headingTh: '2. บัญชี',
      bodyEn:
        'You may sign in with Sign in with Apple, Google, Facebook, a Thai mobile number (SMS OTP), or email and password. You are responsible for activity on your account. You may delete the account in Settings at any time.',
      bodyTh:
        'คุณเข้าสู่ระบบด้วย Sign in with Apple, Google, Facebook, เบอร์มือถือ (รหัส SMS) หรืออีเมลและรหัสผ่าน คุณรับผิดชอบกิจกรรมในบัญชี และลบบัญชีได้ตลอดเวลาในตั้งค่า',
    },
    {
      headingEn: '3. User-generated content',
      headingTh: '3. เนื้อหาที่ผู้ใช้สร้าง (UGC)',
      bodyEn:
        'Do not post illegal, harassing, fraudulent, or infringing content. BoomMall provides in-app Report and Block. Moderators may hide or remove content and suspend accounts that violate these Terms. We may remove copyrighted material after a valid takedown notice.',
      bodyTh:
        'ห้ามโพสต์เนื้อหาผิดกฎหมาย คุกคาม หลอกลวง หรือละเมิดลิขสิทธิ์ BoomMall มีรายงานและบล็อกในแอป ผู้ดูแลอาจซ่อนหรือลบเนื้อหา และระงับบัญชีที่ละเมิด เราอาจลบสื่อละเมิดลิขสิทธิ์เมื่อได้รับแจ้งที่ถูกต้อง',
    },
    {
      headingEn: '4. Purchases',
      headingTh: '4. การซื้อสินค้า',
      bodyEn:
        'Physical-goods checkout charges money only through a real payment provider. This build does not claim a successful card/PromptPay payment unless that provider confirms capture. Digital Boom Coin purchase is not offered in this iOS build.',
      bodyTh:
        'การสั่งสินค้ากายภาพเรียกเก็บเงินผ่านผู้ให้บริการชำระเงินจริงเท่านั้น บิลด์นี้ไม่อ้างว่าชำระบัตร/พร้อมเพย์สำเร็จจนกว่าผู้ให้บริการยืนยัน การซื้อ Boom Coin ไม่มีในบิลด์ iOS นี้',
    },
    {
      headingEn: '5. Intellectual property',
      headingTh: '5. ทรัพย์สินทางปัญญา',
      bodyEn:
        'Do not upload music or media you do not have rights to. BoomMall and its licensors own the app software and marks.',
      bodyTh:
        'ห้ามอัปโหลดเพลงหรือสื่อที่คุณไม่มีสิทธิ์ BoomMall และผู้ให้อนุญาตเป็นเจ้าของซอฟต์แวร์และเครื่องหมายของแอป',
    },
    {
      headingEn: '6. Disclaimer',
      headingTh: '6. การจำกัดความรับผิด',
      bodyEn:
        'The service is provided as-is. To the extent allowed by law, BoomMall is not liable for indirect damages from use of the app.',
      bodyTh:
        'บริการให้ตามสภาพที่เป็นอยู่ ในขอบเขตที่กฎหมายอนุญาต BoomMall ไม่รับผิดชอบความเสียหายทางอ้อมจากการใช้งาน',
    },
    {
      headingEn: '7. Contact',
      headingTh: '7. ติดต่อ',
      bodyEn: 'Terms questions: legal@boommall.app',
      bodyTh: 'สอบถามข้อกำหนด: legal@boommall.app',
    },
  ],
};

export function legalDoc(key: LegalDocKey): LegalDoc {
  return key === 'terms' ? TERMS_DOC : PRIVACY_DOC;
}
