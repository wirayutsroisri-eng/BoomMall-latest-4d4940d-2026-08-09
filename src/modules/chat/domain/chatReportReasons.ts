/** WeChat-style chat report reasons — submitted to the real moderation queue. */
export const CHAT_REPORT_REASONS = [
  'ดำเนินกิจกรรมหลอกลวงหรือกลโกง',
  'โพสต์เนื้อหาลามก โป๊เปลือย หรือการแสวงหาผลประโยชน์จากเรื่องทางเพศ',
  'ส่งเสริมการก่อการร้ายหรือลัทธิหัวรุนแรง',
  'ทำให้เยาวชนตกอยู่ในอันตราย',
  'ดำเนินการคุกคามหรือใช้คำพูดที่สร้างความเกลียดชัง',
  'เผยแพร่เนื้อหานองเลือดหรือการใช้ความรุนแรง',
  'เผยแพร่ข้อมูลการฆ่าตัวตายหรือทำร้ายตัวเอง',
  'เกี่ยวข้องกับธุรกรรมที่ผิดกฎหมายหรือธุรกรรมต้องห้าม',
  'ทำให้เกิดความเสี่ยงต่อความปลอดภัยของบัญชี',
  'ละเมิดสิทธิ์ในทรัพย์สินทางปัญญา',
  'เปิดเผยข้อมูลส่วนบุคคลของผู้อื่นโดยไม่ได้รับอนุญาต',
] as const;

export const CHAT_WALLPAPERS = [
  { id: 'default', color: undefined, swatch: '#EDEDED', label: 'ค่าเริ่มต้น' },
  { id: 'white', color: '#FFFFFF', swatch: '#FFFFFF', label: 'ขาว' },
  { id: 'mist', color: '#E8F1EA', swatch: '#E8F1EA', label: 'เขียวอ่อน' },
  { id: 'grey', color: '#EDEDED', swatch: '#EDEDED', label: 'เทา' },
  { id: 'night', color: '#1C1C1E', swatch: '#1C1C1E', label: 'มืด' },
] as const;

export type ChatSearchFilter =
  | 'date'
  | 'media'
  | 'file'
  | 'url'
  | 'audio'
  | 'transaction'
  | 'miniprogram'
  | 'channel'
  | 'shop'
  | 'gift';

export const CHAT_SEARCH_FILTERS: Array<{ key: ChatSearchFilter; label: string }> = [
  { key: 'date', label: 'วันที่' },
  { key: 'media', label: 'ภาพและวิดีโอ' },
  { key: 'file', label: 'ไฟล์' },
  { key: 'url', label: 'URL' },
  { key: 'audio', label: 'เพลงและเสียง' },
  { key: 'transaction', label: 'ธุรกรรม' },
  { key: 'miniprogram', label: 'มินิโปรแกรม' },
  { key: 'channel', label: 'ช่อง' },
  { key: 'shop', label: 'สินค้าและร้านค้า' },
  { key: 'gift', label: 'ของขวัญ' },
];
