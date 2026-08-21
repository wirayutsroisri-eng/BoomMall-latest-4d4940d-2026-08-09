import type { EditorMedia, OverlayObject } from '@/modules/create/domain/editorComposition';

export type FeedTab = 'nearby' | 'following' | 'foryou' | 'board';

/** เลนคอนเทนต์หลัก — สำหรับคุณ / กำลังติดตาม / ใกล้คุณ / เว็บบอร์ด */
export type FeedLane = FeedTab;

/** Two-sided Community Board marketplace */
export type BoardSide = 'demand' | 'supply';

export type CommerceTier = 'B2B' | 'B2C' | 'C2C';

export type ProductVariant = {
  id: string;
  label: string;
  voltage?: string;
  capacityAh?: number;
  color?: string;
  size?: string;
  price: number;
  stock: number;
  moq?: number;
  wholesaleTiers?: Array<{ minQty: number; unitPrice: number }>;
};

export type FeedProduct = {
  id: string;
  name: string;
  shopName: string;
  tier: CommerceTier;
  basePrice: number;
  currency: 'THB';
  variants: ProductVariant[];
  tags: string[];
};

export type FeedItem = {
  id: string;
  /** Client id before server publish (feed-user-*) — used to load orphaned comments. */
  legacyLocalId?: string;
  author: string;
  authorHandle: string;
  /** Backend user id — used for matching push + chat targeting. */
  authorId?: string;
  /** แท็บหลักที่คลิปนี้โผล่ (โปรไฟล์ยังรวมทุกเลนของ handle เดียวกัน) */
  lane?: FeedLane;
  caption: string;
  location: string;
  /** Optional GPS for Community Board matching (defaults to Chanthaburi on user posts). */
  gps?: { lat: number; lng: number };
  /** Preferred match radius from create/publish (3–50 km or all). Default 10. */
  searchRadius?: 3 | 5 | 10 | 25 | 50 | 'all';
  /**
   * Community Board side:
   * demand = หาช่าง/หาคนช่วย · supply = รับงาน/เสนอบริการ
   */
  boardSide?: BoardSide;
  likes: number;
  comments: number;
  shares: number;
  /** ยอดเหรียญที่คลิปนี้ได้รับ (วอลเล็ตทิป) */
  tips?: number;
  /** เหรียญที่ "เรา" ส่งให้คลิปนี้ในเซสชันนี้ */
  myTipTotal?: number;
  isLive: boolean;
  musicTitle: string;
  gradient: [string, string];
  product: FeedProduct;
  liked?: boolean;
  saved?: boolean;
  /** Real photo/video picked from device — overrides gradient background when present */
  imageUri?: string;
  /** Pixel size of the cover photo — used so shop/job tiles keep the upload aspect */
  imageWidth?: number;
  imageHeight?: number;
  /** หลายรูปในโพสต์เดียว — ปัดซ้าย/ขวาเลื่อนในโพสต์ (ไม่เปิดโปรไฟล์) */
  imageUris?: string[];
  videoUri?: string;
  /** Canonical non-destructive editor composition. */
  editorMedia?: EditorMedia[];
  overlays?: OverlayObject[];
  /** ข้อความที่พิมพ์ทับบนภาพตอนแต่ง (คงอยู่ถึงฟีด) */
  overlayText?: string;
  overlayTextColor?: string;
  /** ตำแหน่ง normalized 0–1 ล็อกจากหน้าแต่ง */
  overlayTransform?: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
  /** ข้อความหลายชิ้น (Text Stickers) — ส่งต่อไปยัง export/composite ครบทุกชิ้น */
  overlayStickers?: Array<{
    id: string;
    text: string;
    color: string;
    fontKey: string;
    transform: { x: number; y: number; scale: number; rotation: number };
  }>;
  /** true when created via the in-app Camera/Creator Studio during this session */
  isUserPost?: boolean;
};


export type FeedComment = {
  id: string;
  feedId: string;
  author: string;
  authorInitial: string;
  /** Backend user id — used to detect own comments + report/block. */
  authorId?: string;
  text: string;
  likes: number;
  createdAt: string;
  liked?: boolean;
  parentId?: string;
  editedAt?: string;
};
