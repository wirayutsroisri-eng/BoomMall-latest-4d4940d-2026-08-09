import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  avatar: text("avatar"),
  phone: varchar("phone", { length: 20 }),
  // KYC fields
  kycStatus: mysqlEnum("kycStatus", ["none", "pending", "approved", "rejected"]).default("none").notNull(),
  kycFullName: text("kycFullName"),
  kycPhone: varchar("kycPhone", { length: 20 }),
  kycProvider: mysqlEnum("kycProvider", ["facebook", "google"]),
  kycSocialId: varchar("kycSocialId", { length: 128 }),
  kycSocialName: text("kycSocialName"),
  kycSocialEmail: varchar("kycSocialEmail", { length: 320 }),
  kycSubmittedAt: timestamp("kycSubmittedAt"),
  kycReviewedAt: timestamp("kycReviewedAt"),
  kycReviewNote: text("kycReviewNote"),
  lineId: varchar("lineId", { length: 64 }),
  facebookUrl: varchar("facebookUrl", { length: 255 }),
  province: varchar("province", { length: 100 }),
  address: text("address"),
  // Shipping address fields
  shippingName: text("shippingName"),
  shippingPhone: varchar("shippingPhone", { length: 20 }),
  shippingAddress: text("shippingAddress"),
  shippingDistrict: varchar("shippingDistrict", { length: 100 }),
  shippingSubdistrict: varchar("shippingSubdistrict", { length: 100 }),
  shippingProvince: varchar("shippingProvince", { length: 100 }),
  shippingZipCode: varchar("shippingZipCode", { length: 10 }),
  // Seller settings
  isSeller: boolean("isSeller").default(false).notNull(),
  sellerFeeRate: decimal("sellerFeeRate", { precision: 5, scale: 2 }).default("7.00"),
  bankAccountName: text("bankAccountName"),
  bankAccountNumber: varchar("bankAccountNumber", { length: 20 }),
  bankName: varchar("bankName", { length: 64 }),
  promptpayNumber: varchar("promptpayNumber", { length: 20 }),
  defaultPromptpayQrUrl: text("defaultPromptpayQrUrl"),
  defaultPromptpayQrKey: text("defaultPromptpayQrKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Categories ───────────────────────────────────────────────────────────────
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  icon: varchar("icon", { length: 50 }),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Category = typeof categories.$inferSelect;

// ─── Products ─────────────────────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  sellerId: int("sellerId").notNull(),
  categoryId: int("categoryId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  condition: mysqlEnum("condition", ["new", "like_new", "good", "fair", "poor"]).default("good").notNull(),
  status: mysqlEnum("status", ["draft", "pending_fee", "pending_approval", "active", "sold", "hidden", "deleted", "rejected", "expired"]).default("pending_fee").notNull(),
  images: json("images").$type<string[]>().default([]),
  videoUrl: text("videoUrl"),
  videoKey: text("videoKey"),
  videoDuration: int("videoDuration"), // วินาที
  videoThumbnailUrl: text("videoThumbnailUrl"),
  /** โหมดการขาย: c2c=มือสอง, b2b=ส่งราคา, both=รองรับทั้งสอง */
  listingType: mysqlEnum("listingType", ["c2c", "b2b", "both"]).default("both").notNull(),
  location: varchar("location", { length: 100 }),
  quantity: int("quantity").default(1).notNull(),
  contactPhone: varchar("contactPhone", { length: 20 }),
  contactLineId: varchar("contactLineId", { length: 64 }),
  contactFacebookUrl: varchar("contactFacebookUrl", { length: 255 }),
  shippingFee: decimal("shippingFee", { precision: 10, scale: 2 }).default("0").notNull(),
  allowCod: boolean("allowCod").default(false).notNull(),
  allowWallet: boolean("allowWallet").default(false).notNull(),
  allowPromptpay: boolean("allowPromptpay").default(false).notNull(),
  // Payment details for PromptPay/Bank transfer
  bankName: varchar("bankName", { length: 64 }),
  bankAccountNumber: varchar("bankAccountNumber", { length: 20 }),
  bankAccountName: text("bankAccountName"),
  promptpayNumber: varchar("promptpayNumber", { length: 20 }),
  conditionPercent: int("conditionPercent"),
  originalPrice: decimal("originalPrice", { precision: 12, scale: 2 }),
  salePrice: decimal("salePrice", { precision: 12, scale: 2 }),
  retailPrice: decimal("retailPrice", { precision: 12, scale: 2 }),
  priceTiers: json("priceTiers").$type<{ minQty: number; pricePerUnit: number }[]>().default([]),
  promptpayQrUrl: text("promptpayQrUrl"),
  promptpayQrKey: text("promptpayQrKey"),
  deliveryDays: int("deliveryDays").default(3).notNull(),
  viewCount: int("viewCount").default(0),
  salesCount: int("salesCount").default(0).notNull(),
  listingFeeRate: decimal("listingFeeRate", { precision: 5, scale: 2 }),
  listingFeeAmount: decimal("listingFeeAmount", { precision: 12, scale: 2 }),
  listingFeePaid: boolean("listingFeePaid").default(false).notNull(),
  approvedAt: timestamp("approvedAt"),
  approvedBy: int("approvedBy"),
  rejectedNote: text("rejectedNote"),
  // ─── Listing Expiry ───────────────────────────────────────────────────────────
  expiresAt: timestamp("expiresAt"),           // null = ยังไม่ได้ approve
  renewedAt: timestamp("renewedAt"),           // ต่ออายุล่าสุด
  renewCount: int("renewCount").default(0).notNull(), // จำนวนครั้งที่ต่ออายุ
  // ─── Sale Slip (สลิปยืนยันการขาย) ────────────────────────────────────────────
  saleSlipUrl: text("saleSlipUrl"),            // URL สลิปยืนยันการขาย
  saleSlipKey: text("saleSlipKey"),            // S3 key ของสลิปยืนยันการขาย
  soldAt: timestamp("soldAt"),                 // เวลาที่ขายแล้ว
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Wallets ──────────────────────────────────────────────────────────────────
export const wallets = mysqlTable("wallets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  balance: decimal("balance", { precision: 14, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Wallet = typeof wallets.$inferSelect;

// ─── Wallet Transactions ──────────────────────────────────────────────────────
export const walletTransactions = mysqlTable("wallet_transactions", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["topup", "purchase", "refund", "payout", "fee", "escrow_hold", "escrow_release"]).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  balanceBefore: decimal("balanceBefore", { precision: 14, scale: 2 }).notNull(),
  balanceAfter: decimal("balanceAfter", { precision: 14, scale: 2 }).notNull(),
  referenceId: int("referenceId"),
  referenceType: varchar("referenceType", { length: 50 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WalletTransaction = typeof walletTransactions.$inferSelect;

// ─── Orders ───────────────────────────────────────────────────────────────────
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  buyerId: int("buyerId").notNull(),
  sellerId: int("sellerId").notNull(),
  productId: int("productId").notNull(),
  productTitle: varchar("productTitle", { length: 255 }).notNull(),
  productImage: text("productImage"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  feeRate: decimal("feeRate", { precision: 5, scale: 2 }).notNull(),
  feeAmount: decimal("feeAmount", { precision: 12, scale: 2 }).notNull(),
  sellerReceives: decimal("sellerReceives", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", [
    "pending_payment",       // รอชำระเงิน / รอผู้ขายยืนยัน (COD)
    "waiting_buyer_confirm", // รอผู้ซื้อยอมรับเงื่อนไข COD
    "seller_confirmed",      // ผู้ซื้อยอมรับแล้ว รอจัดส่ง
    "payment_submitted",     // ส่งสลิปแล้ว รอ admin ยืนยัน
    "payment_confirmed",     // admin ยืนยันแล้ว เงินอยู่ใน escrow
    "shipped",               // ผู้ขายจัดส่งแล้ว
    "completed",             // ผู้ซื้อยืนยันรับสินค้า
    "cancelled",             // ยกเลิก
    "refunded",              // คืนเงิน
  ]).default("pending_payment").notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["promptpay", "bank_transfer", "wallet", "cod"]).default("promptpay"),
  shippingFee: decimal("shippingFee", { precision: 10, scale: 2 }).default("0").notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull().default("0"),
  // Seller payment info snapshot (direct payment)
  sellerPromptpay: varchar("sellerPromptpay", { length: 20 }),
  sellerPromptpayQrUrl: text("sellerPromptpayQrUrl"),
  sellerBankName: varchar("sellerBankName", { length: 64 }),
  sellerBankAccountName: text("sellerBankAccountName"),
  sellerBankAccountNumber: varchar("sellerBankAccountNumber", { length: 20 }),
  shippingAddress: text("shippingAddress"),
  trackingNumber: varchar("trackingNumber", { length: 100 }),
  shippingProvider: varchar("shippingProvider", { length: 50 }),
  shippedAt: timestamp("shippedAt"),
  codAgreementAcceptedAt: timestamp("codAgreementAcceptedAt"),
  note: text("note"),
  completedAt: timestamp("completedAt"),
  cancelledAt: timestamp("cancelledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

// ─── Payment Slips ────────────────────────────────────────────────────────────
export const paymentSlips = mysqlTable("payment_slips", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  slipUrl: text("slipUrl").notNull(),
  slipKey: text("slipKey").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewNote: text("reviewNote"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaymentSlip = typeof paymentSlips.$inferSelect;

// ─── Payout Requests ──────────────────────────────────────────────────────────
export const payoutRequests = mysqlTable("payout_requests", {
  id: int("id").autoincrement().primaryKey(),
  sellerId: int("sellerId").notNull(),
  orderId: int("orderId"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  bankAccountName: text("bankAccountName"),
  bankAccountNumber: varchar("bankAccountNumber", { length: 20 }),
  bankName: varchar("bankName", { length: 64 }),
  promptpayNumber: varchar("promptpayNumber", { length: 20 }),
  status: mysqlEnum("status", ["pending", "processing", "completed", "rejected"]).default("pending").notNull(),
  adminNote: text("adminNote"),
  transferSlipUrl: text("transferSlipUrl"),
  processedBy: int("processedBy"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PayoutRequest = typeof payoutRequests.$inferSelect;

// ─── Reviews ──────────────────────────────────────────────────────────────────
export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().unique(),
  reviewerId: int("reviewerId").notNull(),
  sellerId: int("sellerId").notNull(),
  productId: int("productId").notNull(),
  rating: int("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Review = typeof reviews.$inferSelect;

// ─── Listing Fee Transactions ────────────────────────────────────────────────
export const listingFeeTransactions = mysqlTable("listing_fee_transactions", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  sellerId: int("sellerId").notNull(),
  feeRate: decimal("feeRate", { precision: 5, scale: 2 }).notNull(),
  feeAmount: decimal("feeAmount", { precision: 12, scale: 2 }).notNull(),
  productPrice: decimal("productPrice", { precision: 12, scale: 2 }).notNull(),
  walletId: int("walletId"),
  balanceBefore: decimal("balanceBefore", { precision: 14, scale: 2 }),
  balanceAfter: decimal("balanceAfter", { precision: 14, scale: 2 }),
  approvedBy: int("approvedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ListingFeeTransaction = typeof listingFeeTransactions.$inferSelect;

// ─── Listing Fee Slips ───────────────────────────────────────────────────────
export const listingFeeSlips = mysqlTable("listing_fee_slips", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  sellerId: int("sellerId").notNull(),
  slipUrl: text("slipUrl").notNull(),
  slipKey: text("slipKey").notNull(),
  feeAmount: decimal("feeAmount", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewNote: text("reviewNote"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ListingFeeSlip = typeof listingFeeSlips.$inferSelect;

// ─── Conversations ──────────────────────────────────────────────────────────
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  buyerId: int("buyerId").notNull(),
  sellerId: int("sellerId").notNull(),
  productId: int("productId").notNull(),
  /** โหมดแชท: b2b=สอบถามราคาส่ง, c2c=ซื้อของมือสอง */
  chatMode: mysqlEnum("chatMode", ["c2c", "b2b"]).default("c2c").notNull(),
  lastMessageAt: timestamp("lastMessageAt"),
  buyerUnread: int("buyerUnread").default(0).notNull(),
  sellerUnread: int("sellerUnread").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;

// ─── Messages ───────────────────────────────────────────────────────────────
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderId: int("senderId").notNull(),
  content: text("content").notNull(),
  messageType: mysqlEnum("messageType", ["text", "shipping_address", "payment_info"]).default("text").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;

// ─── Cart Items ─────────────────────────────────────────────────────────────
export const cartItems = mysqlTable("cart_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId").notNull(),
  quantity: int("quantity").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = typeof cartItems.$inferInsert;

// ─── Search Queries (Feedback / Alert) ──────────────────────────────────────
export const searchQueries = mysqlTable("search_queries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),               // null = guest
  email: varchar("email", { length: 320 }),  // email ที่จะส่งแจ้งเตือน
  query: varchar("query", { length: 255 }).notNull(),
  notifiedProductIds: json("notifiedProductIds").$type<number[]>().default([]),
  lastNotifiedAt: timestamp("lastNotifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SearchQuery = typeof searchQueries.$inferSelect;
export type InsertSearchQuery = typeof searchQueries.$inferInsert;

// ─── Product Likes ──────────────────────────────────────────────────────────
export const productLikes = mysqlTable("product_likes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProductLike = typeof productLikes.$inferSelect;

// ─── Seller Follows ──────────────────────────────────────────────────────────
export const sellerFollows = mysqlTable("seller_follows", {
  id: int("id").autoincrement().primaryKey(),
  followerId: int("followerId").notNull(),
  sellerId: int("sellerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SellerFollow = typeof sellerFollows.$inferSelect;

// ─── Product Views (for personalization) ────────────────────────────────────
export const productViews = mysqlTable("product_views", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),           // null = guest
  productId: int("productId").notNull(),
  categoryId: int("categoryId"),   // snapshot ตอนดู
  viewedAt: timestamp("viewedAt").defaultNow().notNull(),
});
export type ProductView = typeof productViews.$inferSelect;

// ─── Push Subscriptions ────────────────────────────────────────────────────────
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  fcmToken: text("fcmToken").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

// ─── System Settings ──────────────────────────────────────────────────────────
export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
