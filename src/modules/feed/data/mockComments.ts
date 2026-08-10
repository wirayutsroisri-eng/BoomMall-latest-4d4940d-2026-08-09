import type { FeedComment } from '../domain/types';

let counter = 0;
function c(feedId: string, author: string, text: string, likes: number, createdAt: string): FeedComment {
  counter += 1;
  return {
    id: `cm-${counter}`,
    feedId,
    author,
    authorInitial: author.slice(0, 1),
    text,
    likes,
    createdAt,
  };
}

export const mockComments: FeedComment[] = [
  c('feed-01', 'ต้อมช่างไฟฟ้า', 'แบตนี้ใช้กับ Nice ได้ไหมครับ', 24, '2 ชม.'),
  c('feed-01', 'มิ้นท์ EV', 'รับประกัน 3 ปีคุ้มมากก', 12, '1 ชม.'),
  c('feed-01', 'โบ๊ทซ่อมรถ', 'ราคาดีกว่าที่กรุงเทพเยอะเลย', 8, '45 นาที'),
  c('feed-02', 'เอกช่างกลึง', 'งาน CNC เนี้ยบมาก ขอราคาส่งหน่อยครับ', 15, '3 ชม.'),
  c('feed-02', 'นัทไบค์เกอร์', 'ใส่กับ PCX ได้ป่าวคับ', 6, '2 ชม.'),
  c('feed-03', 'ร้านซ่อมบางแสน', 'MOQ 10 ลดเยอะไหมครับ สนใจสั่งประจำ', 9, '5 ชม.'),
  c('feed-06', 'กบสกู๊ตเตอร์', 'BMS สมาร์ทมอนิเตอร์ผ่านแอปได้จริงป่าว', 31, '1 ชม.'),
  c('feed-06', 'วินเวสป้า', 'ใช้มา 2 เดือนแล้วเซลล์บาลานซ์ดีมาก', 18, '30 นาที'),
  c('feed-20', 'ปอนด์แปลงรถ', 'ชุดแปลงเต็มราคานี้คุ้มสุดในตลาดละ', 42, '4 ชม.'),
  c('feed-20', 'ไก่การช่าง', 'สนใจ 72V 3000W ติดตั้งกี่วันเสร็จครับ', 20, '2 ชม.'),
];
