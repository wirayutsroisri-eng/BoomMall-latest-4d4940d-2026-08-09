/**
 * Dev bypass — ใช้เมื่อยังไม่ได้ต่อ backend/DB จริง
 * เปิดด้วย VITE_DEV_BYPASS_AUTH=true หรือ auto-detect เมื่อไม่มี OAuth env
 */

export type MockUser = {
  id: number;
  openId: string;
  name: string;
  email: string;
  role: "user" | "admin";
  avatar: string | null;
  phone: string | null;
  kycStatus: "none" | "pending" | "approved" | "rejected";
  isSeller: boolean;
  loginMethod: string;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export type MockFeedProduct = {
  id: number;
  title: string;
  description: string;
  price: string;
  images: string[];
  videoUrl: string | null;
  listingType: "c2c" | "b2b" | "both";
  location: string;
  sellerId: number;
  priceTiers?: { minQty: number; pricePerUnit: number }[];
};

/** เปิด bypass เมื่อตั้ง env หรือ OAuth ยังไม่ได้ config */
export function isDevBypassEnabled(): boolean {
  if (import.meta.env.VITE_DEV_BYPASS_AUTH === "true") return true;
  if (import.meta.env.VITE_DEV_BYPASS_AUTH === "false") return false;
  // auto: ไม่มี OAuth config → bypass
  const portal = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  return !portal || !appId;
}

export const MOCK_USER: MockUser = {
  id: 9001,
  openId: "dev-mock-user",
  name: "ผู้ใช้ทดสอบ (Dev)",
  email: "dev@boommall.local",
  role: "user",
  avatar: null,
  phone: "0812345678",
  kycStatus: "approved",
  isSeller: true,
  loginMethod: "mock",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

/** สินค้าจำลองสำหรับ Video Feed — ครบทั้ง 3 โหมด listingType */
export const MOCK_FEED_PRODUCTS: MockFeedProduct[] = [
  {
    id: 1001,
    title: "iPhone 14 Pro Max 256GB สภาพ 95%",
    description: "เครื่องไทย แบต 92% ไม่เคยซ่อม มีกล่องครบ",
    price: "28500.00",
    images: ["https://picsum.photos/seed/boommall1/720/1280"],
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    listingType: "both",
    location: "กรุงเทพมหานคร",
    sellerId: 501,
  },
  {
    id: 1002,
    title: "เสื้อยืดแบรนด์เนม ล็อตส่ง 50 ตัว",
    description: "ราคาส่ง B2B ขั้นต่ำ 20 ตัว สั่งเพิ่มลดได้",
    price: "8900.00",
    images: ["https://picsum.photos/seed/boommall2/720/1280"],
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    listingType: "b2b",
    location: "สมุทรปราการ",
    sellerId: 502,
    priceTiers: [
      { minQty: 20, pricePerUnit: 420 },
      { minQty: 50, pricePerUnit: 380 },
    ],
  },
  {
    id: 1003,
    title: "กล้อง Mirrorless มือสอง พร้อมเลนส์",
    description: "ใช้งานน้อย มีใบรับประกันร้าน",
    price: "15900.00",
    images: ["https://picsum.photos/seed/boommall3/720/1280"],
    videoUrl: null,
    listingType: "c2c",
    location: "เชียงใหม่",
    sellerId: 503,
  },
  {
    id: 1004,
    title: "รองเท้าผ้าใบ Limited Edition",
    description: "ของแท้ 100% ซื้อจาก shop โดยตรง",
    price: "4200.00",
    images: ["https://picsum.photos/seed/boommall4/720/1280"],
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    listingType: "both",
    location: "ขอนแก่น",
    sellerId: 504,
  },
];

/** seller IDs ที่ mock user ติดตาม (สำหรับแท็บ "กำลังติดตาม") */
export const MOCK_FOLLOWED_SELLER_IDS = [502, 504];

export function getMockFeedPage(offset: number, limit: number, opts?: { followedOnly?: boolean }): MockFeedProduct[] {
  let pool = [...MOCK_FEED_PRODUCTS, ...MOCK_FEED_PRODUCTS.map((p, i) => ({ ...p, id: p.id + 100 + i }))];
  if (opts?.followedOnly) {
    pool = pool.filter((p) => MOCK_FOLLOWED_SELLER_IDS.includes(p.sellerId));
  }
  return pool.slice(offset, offset + limit);
}
