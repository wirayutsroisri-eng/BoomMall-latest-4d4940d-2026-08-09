/** Core Boom Coin transaction types (V1). */

export type BoomTxType =
  | 'TOPUP'
  | 'TRANSFER'
  | 'CONTENT_SUPPORT'
  | 'COMMENT_SUPPORT'
  | 'LIVE_SUPPORT'
  | 'CREATOR_REWARD'
  | 'COMMUNITY_REWARD'
  | 'WATCH_REWARD'
  | 'AFFILIATE_COMMISSION'
  | 'WAREHOUSE_COMMISSION'
  | 'SELLER_COMMISSION'
  | 'PRODUCT_PAYMENT'
  | 'PRODUCT_DISCOUNT'
  | 'SHIPPING_PAYMENT'
  | 'ADS_PAYMENT'
  | 'SERVICE_PAYMENT'
  | 'CAMPAIGN_REWARD'
  | 'PROMOTION_REWARD'
  | 'REFUND'
  | 'REVERSAL'
  | 'ADMIN_ADJUSTMENT'
  | 'RESERVE_LOCK'
  | 'RESERVE_RELEASE'
  | 'RESERVE_CAPTURE';

export type BoomTxStatus =
  | 'PENDING'
  | 'COMMITTED'
  | 'FAILED'
  | 'REVERSED'
  | 'CANCELLED';

export type WalletStatus = 'NORMAL' | 'LIMITED' | 'REVIEW' | 'FROZEN';

export type AccountBucket = 'available' | 'pending' | 'locked';

export type TreasuryCode =
  | 'PLATFORM_TREASURY'
  | 'REWARD_POOL'
  | 'COMMUNITY_POOL'
  | 'CREATOR_POOL'
  | 'ADS_POOL'
  | 'MERCHANT_POOL'
  | 'SHIPPING_POOL'
  | 'AFFILIATE_POOL'
  | 'WAREHOUSE_POOL'
  | 'PROMOTION_POOL'
  | 'RESERVE_POOL';

export type CoinCapability =
  | 'SOCIAL_SUPPORT'
  | 'COMMENT_SUPPORT'
  | 'LIVE_SUPPORT'
  | 'PRODUCT_PURCHASE'
  | 'PRODUCT_DISCOUNT'
  | 'SHIPPING'
  | 'ADS'
  | 'BOOST'
  | 'AFFILIATE'
  | 'WAREHOUSE'
  | 'SELLER_SERVICE'
  | 'CREATOR_SERVICE'
  | 'COMMUNITY_REWARD'
  | 'PROMOTION'
  | 'FUTURE_SERVICE';

export const DEFAULT_CAPABILITIES: CoinCapability[] = [
  'SOCIAL_SUPPORT',
  'COMMENT_SUPPORT',
  'LIVE_SUPPORT',
  'PRODUCT_PURCHASE',
  'PRODUCT_DISCOUNT',
  'SHIPPING',
  'ADS',
  'BOOST',
  'AFFILIATE',
  'WAREHOUSE',
  'SELLER_SERVICE',
  'CREATOR_SERVICE',
  'COMMUNITY_REWARD',
  'PROMOTION',
  'FUTURE_SERVICE',
];

export const TX_LABEL_TH: Partial<Record<BoomTxType, string>> = {
  TOPUP: 'เติม Boom Coin',
  TRANSFER: 'โอน Coin',
  CONTENT_SUPPORT: 'สนับสนุนคอนเทนต์',
  COMMENT_SUPPORT: 'สนับสนุนคอมเมนต์',
  LIVE_SUPPORT: 'สนับสนุนไลฟ์',
  CREATOR_REWARD: 'รางวัลครีเอเตอร์',
  COMMUNITY_REWARD: 'รางวัลชุมชน',
  WATCH_REWARD: 'รางวัลการดู',
  AFFILIATE_COMMISSION: 'คอมมิชชัน Affiliate',
  WAREHOUSE_COMMISSION: 'คอมมิชชันคลังร่วม',
  SELLER_COMMISSION: 'คอมมิชชันผู้ขาย',
  PRODUCT_PAYMENT: 'ชำระสินค้า',
  PRODUCT_DISCOUNT: 'ส่วนลดสินค้า',
  SHIPPING_PAYMENT: 'ค่าจัดส่ง',
  ADS_PAYMENT: 'Boom Ads',
  SERVICE_PAYMENT: 'ค่าบริการ',
  CAMPAIGN_REWARD: 'รางวัลแคมเปญ',
  PROMOTION_REWARD: 'รางวัลโปรโมชัน',
  REFUND: 'คืน Coin',
  REVERSAL: 'ยกเลิกรายการ',
  ADMIN_ADJUSTMENT: 'ปรับยอดโดยแอดมิน',
  RESERVE_LOCK: 'ล็อกยอด Checkout',
  RESERVE_RELEASE: 'ปลดล็อก Checkout',
  RESERVE_CAPTURE: 'ตัดยอด Checkout',
};
