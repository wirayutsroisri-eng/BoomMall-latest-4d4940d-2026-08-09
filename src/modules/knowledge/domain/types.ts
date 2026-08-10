export type KnowledgeArticle = {
  id: string;
  title: string;
  category: 'battery' | 'wiring' | 'chassis' | 'bms' | 'lifestyle';
  summary: string;
  body: string;
  savedOffline: boolean;
  updatedAt: string;
};

export type VehicleLog = {
  id: string;
  model: string;
  plate: string;
  batterySpec: string;
  lastService: string;
  notes: string;
  wiringDiagramNote: string;
};

export type DigitalWarranty = {
  id: string;
  productName: string;
  serialNo: string;
  shopName: string;
  shopVerified: boolean;
  technicianRank: string;
  issuedAt: string;
  expiresAt: string;
  coverage: string;
};

export type VipProfile = {
  displayName: string;
  handle: string;
  bio: string;
  avatarUri?: string | null;
  /** Facebook Page–style cover banner shown behind the overlapping avatar. */
  coverUri?: string | null;
  loyaltyTier: 'Bronze' | 'Silver' | 'Gold' | 'Boom VIP';
  points: number;
  technicianBadge: string;
  shopVerified: boolean;
  followingCount: number;
  followersCount: number;
  likesCount: number;
};
