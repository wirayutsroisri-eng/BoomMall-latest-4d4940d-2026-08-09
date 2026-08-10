export type BotPersona = {
  id: string;
  name: string;
  handle: string;
  avatarColor: string;
  role: string;
  greeting: string;
};

/** 5 core bot personas — Boom EV Assistant network */
export const BOT_PERSONAS: BotPersona[] = [
  {
    id: 'bot-boomev',
    name: 'Boom EV Shop Chanthaburi',
    handle: '@boomev_chanthaburi',
    avatarColor: '#00D68F',
    role: 'ร้านแม่ข่าย · แบตเตอรี่ & อะไหล่แต่ง EV',
    greeting: 'สวัสดีครับ ผม "ช่างป๋าบูม" น้อง Boom EV Assistant ยินดีให้บริการครับ',
  },
  {
    id: 'bot-earth',
    name: 'ช่างเอิร์ธ Boom EV',
    handle: '@earth_tech',
    avatarColor: '#00A86B',
    role: 'ช่างทองคำ · ติดตั้งแบต/BMS',
    greeting: 'สวัสดีครับ ช่างเอิร์ธพร้อมดูแลครับ',
  },
  {
    id: 'bot-showroom',
    name: 'แม่ค้าโชว์รูมจันทบุรี',
    handle: '@chan_showroom',
    avatarColor: '#2E8CFF',
    role: 'โชว์รูมอะไหล่แต่ง CNC Racing',
    greeting: 'สวัสดีค่ะ ยินดีต้อนรับสู่โชว์รูมจันทบุรีค่ะ',
  },
  {
    id: 'bot-vip',
    name: 'ลูกค้า VIP — คุณมิ้นท์',
    handle: '@mint_vip',
    avatarColor: '#F5A524',
    role: 'ลูกค้า VIP Boom Loyalty',
    greeting: 'หวัดดีค่ะ',
  },
  {
    id: 'bot-sky',
    name: 'น้อง Sky',
    handle: '@sky_support',
    avatarColor: '#FE2C55',
    role: 'ทีมงานรับสร้างบ้าน · แอดมินซัพพอร์ต',
    greeting: 'สวัสดีค่ะ น้อง Sky ยินดีช่วยเหลือค่ะ',
  },
];

type ReplyRule = { keywords: string[]; replies: string[] };

const RULES: ReplyRule[] = [
  {
    keywords: ['ราคา', 'เท่าไหร่', 'เท่าไร', 'บาท'],
    replies: [
      'ราคาสเปกที่สนใจเริ่มต้นตามที่แจ้งในคลิปเลยครับ ถ้าเอาจำนวนเยอะมีราคาส่งขั้นบันไดให้ด้วยนะครับ',
      'ตอนนี้มีโปรโมชันลดพิเศษให้ลูกค้าจันทบุรีด้วยค่ะ สนใจให้ออกใบเสนอราคาเลยไหมคะ',
    ],
  },
  {
    keywords: ['แบต', 'battery', 'โวลต์', 'v', 'ah'],
    replies: [
      'แบตรุ่นนี้ผ่านการรับประกัน 3 ปี พร้อม BMS สมาร์ทมอนิเตอร์ผ่านแอปได้เลยครับ',
      'สเปกแรงดันที่มีตอนนี้ครบทั้ง 12.8V / 48V / 60V / 72V เลยครับ อยากได้รุ่นไหนบอกได้เลย',
    ],
  },
  {
    keywords: ['ส่ง', 'จัดส่ง', 'shipping', 'delivery'],
    replies: [
      'จัดส่งได้ทั้งแบบมาตรฐาน 3-5 วันฟรีค่าส่ง หรือด่วน 1-2 วันครับ',
      'ของพร้อมส่งค่ะ กดยืนยันได้เลย พรุ่งนี้ถึงแน่นอนค่ะ',
    ],
  },
  {
    keywords: ['ติดตั้ง', 'install', 'ช่าง'],
    replies: [
      'มีทีมช่างระดับทองคำของ Boom EV คอยติดตั้งให้ถึงที่เลยครับ นัดคิวได้เลย',
    ],
  },
  {
    keywords: ['รับประกัน', 'warranty', 'ประกัน'],
    replies: [
      'รับประกันสินค้าออกบัตร Digital Warranty Card เก็บไว้ใน Boom Vault ได้เลยครับ อุ่นใจหายห่วง',
    ],
  },
  {
    keywords: ['สวัสดี', 'หวัดดี', 'หวัดดีครับ', 'หวัดดีค่ะ'],
    replies: ['สวัสดีครับ มีอะไรให้ช่วยแนะนำเพิ่มไหมครับ'],
  },
];

const FALLBACKS = [
  'รับทราบครับ รอสักครู่นะครับ กำลังตรวจสอบให้ครับ',
  'ขอบคุณที่ทักมานะครับ เดี๋ยวแอดมินเช็กสต็อกให้อีกทีครับ',
  'รับเรื่องแล้วค่ะ จะรีบตอบกลับให้เร็วที่สุดค่ะ',
];

const IMAGE_REPLIES = [
  'ได้รับรูปแล้วครับ กำลังตรวจสอบสเปก/สภาพให้นะครับ',
  'เห็นรูปแล้วค่ะ สวยเลย รอแป๊บนะคะ กำลังเช็กราคาให้',
];

const VOICE_REPLIES = [
  'ฟังข้อความเสียงแล้วครับ เดี๋ยวจัดการให้เลยนะครับ',
  'ได้ยินชัดเลยค่ะ รับเรื่องแล้ว รอแป๊บนะคะ',
];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

export function getBotReply(userText: string, seed: number): string {
  const lower = userText.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      return pick(rule.replies, seed);
    }
  }
  return pick(FALLBACKS, seed);
}

export function getBotImageReply(seed: number): string {
  return pick(IMAGE_REPLIES, seed);
}

export function getBotVoiceReply(seed: number): string {
  return pick(VOICE_REPLIES, seed);
}
