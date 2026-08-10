import * as SQLite from 'expo-sqlite';
import type { KnowledgeArticle, VehicleLog } from '../domain/types';

const DB_NAME = 'boommall_knowledge.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS articles (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          category TEXT NOT NULL,
          summary TEXT NOT NULL,
          body TEXT NOT NULL,
          saved_offline INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS vehicles (
          id TEXT PRIMARY KEY NOT NULL,
          model TEXT NOT NULL,
          plate TEXT NOT NULL,
          battery_spec TEXT NOT NULL,
          last_service TEXT NOT NULL,
          notes TEXT NOT NULL,
          wiring_diagram_note TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

const seedArticles: KnowledgeArticle[] = [
  {
    id: 'a-1',
    title: 'จับคู่แรงดัน V-Ah แบตลิเธียม 12.8V / 48-72V',
    category: 'battery',
    summary: 'เลือกแพ็กให้เข้ากับคอนโทรลเลอร์และมอเตอร์ — ไม่ให้ตัด BMS',
    body: 'กฎเหล็ก: แรงดันแพ็กต้องอยู่ในช่วงคอนโทรลเลอร์, Ah สัมพันธ์ระยะทาง, ตรวจ continuous discharge ของ BMS ก่อนใส่สกู๊ตเตอร์ Boom EV.',
    savedOffline: true,
    updatedAt: '2026-08-01',
  },
  {
    id: 'a-2',
    title: 'ไดอะแกรมวงจรไฟแปลง Wave → EV',
    category: 'wiring',
    summary: 'สายหลัก 8AWG, ฟิวส์, คอนแทคเตอร์ และกราวด์แชสซี',
    body: 'แยกสายสัญญาณ throttle/hall จากสายกำลัง, ใช้ซิลิโคนทนร้อน, ยึดคอนโทรลเลอร์ให้มีลมระบาย, กันน้ำหัวต่อด้วยเจล.',
    savedOffline: true,
    updatedAt: '2026-07-20',
  },
  {
    id: 'a-3',
    title: 'บาลานซ์เซลล์ LiFePO4 กับ BMS บลูทูธ',
    category: 'bms',
    summary: 'อ่าน delta mV ผ่านแอป แล้วชาร์จเต็มจนบาลานซ์นิ่ง',
    body: 'ถ้า delta > 50mV ให้ชาร์จช้า, อย่าปล่อยเซลล์ต่ำกว่า 2.5V, อัปเดตเฟิร์มแวร์ BMS จาก Boom EV Shop เท่านั้น.',
    savedOffline: true,
    updatedAt: '2026-07-12',
  },
  {
    id: 'a-4',
    title: 'เซ็ตโช้ค/ปั๊มเบรกหลังใส่แบตหนัก',
    category: 'chassis',
    summary: 'แบตหลังหนักขึ้น — ปรับ preload และระยะเบรก',
    body: 'ใช้โช้คแก๊ส 340-360mm, จาน CNC 220mm+, ไล่น้ำมันเบรกหลังเปลี่ยนปั๊ม, ทดสอบเบรกแห้ง/เปียกก่อนส่งมอบ.',
    savedOffline: true,
    updatedAt: '2026-06-30',
  },
  {
    id: 'a-5',
    title: 'ไลฟ์สไตล์ช่าง EV จันทบุรี — เครื่องมือติดรถ',
    category: 'lifestyle',
    summary: 'ชุดเครื่องมือมินิที่ต้องมีเมื่อออกงานนอกสถานที่',
    body: 'มัลติมิเตอร์, ประแจทอร์ก, หัวแชร์จพกพา 12.8V, เทปกาวกันความร้อน, สมุดสเปก Offline ใน Boom Vault.',
    savedOffline: true,
    updatedAt: '2026-06-18',
  },
];

const seedVehicles: VehicleLog[] = [
  {
    id: 'veh-1',
    model: 'Honda Wave 125i → EV Convert',
    plate: 'กข 4521 จันทบุรี',
    batterySpec: '60V 32Ah LiFePO4 + BMS 16S',
    lastService: '2 สัปดาห์ก่อน',
    notes: 'คอนโทรลเลอร์ 2000W / โช้ค 340mm',
    wiringDiagramNote: 'แผนผังหลัก: Pack+ → Fuse 80A → Contactor → Controller; Hall 5V แยกสาย',
  },
  {
    id: 'veh-2',
    model: 'Boom Scooter X1',
    plate: 'ขน 8890 จันทบุรี',
    batterySpec: '48V 30Ah Fleet Pack',
    lastService: '1 เดือนก่อน',
    notes: 'เซลล์บาลานซ์ปกติ',
    wiringDiagramNote: 'ใช้ชาร์จพอร์ตแยกจากวงจรขับเคลื่อน, NTC ติดแพ็ก',
  },
];

export async function initKnowledgeDb(): Promise<void> {
  const db = await getDb();
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM articles');
  if ((count?.c ?? 0) === 0) {
    for (const a of seedArticles) {
      await db.runAsync(
        `INSERT INTO articles (id, title, category, summary, body, saved_offline, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        a.id,
        a.title,
        a.category,
        a.summary,
        a.body,
        a.savedOffline ? 1 : 0,
        a.updatedAt,
      );
    }
  }
  const vCount = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM vehicles');
  if ((vCount?.c ?? 0) === 0) {
    for (const v of seedVehicles) {
      await db.runAsync(
        `INSERT INTO vehicles (id, model, plate, battery_spec, last_service, notes, wiring_diagram_note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        v.id,
        v.model,
        v.plate,
        v.batterySpec,
        v.lastService,
        v.notes,
        v.wiringDiagramNote,
      );
    }
  }
}

export async function listArticles(): Promise<KnowledgeArticle[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    category: KnowledgeArticle['category'];
    summary: string;
    body: string;
    saved_offline: number;
    updated_at: string;
  }>('SELECT * FROM articles ORDER BY updated_at DESC');
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    summary: r.summary,
    body: r.body,
    savedOffline: Boolean(r.saved_offline),
    updatedAt: r.updated_at,
  }));
}

export async function listVehicles(): Promise<VehicleLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    model: string;
    plate: string;
    battery_spec: string;
    last_service: string;
    notes: string;
    wiring_diagram_note: string;
  }>('SELECT * FROM vehicles ORDER BY model ASC');
  return rows.map((r) => ({
    id: r.id,
    model: r.model,
    plate: r.plate,
    batterySpec: r.battery_spec,
    lastService: r.last_service,
    notes: r.notes,
    wiringDiagramNote: r.wiring_diagram_note,
  }));
}

export async function saveArticleOffline(id: string, saved: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE articles SET saved_offline = ? WHERE id = ?', saved ? 1 : 0, id);
}
