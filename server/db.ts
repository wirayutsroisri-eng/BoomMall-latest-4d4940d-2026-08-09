import { and, asc, count, desc, eq, ilike, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Category,
  InsertUser,
  ListingFeeSlip,
  ListingFeeTransaction,
  Order,
  PaymentSlip,
  PayoutRequest,
  Product,
  Review,
  SystemSetting,
  User,
  Wallet,
  WalletTransaction,
  categories,
  listingFeeSlips,
  listingFeeTransactions,
  orders,
  paymentSlips,
  payoutRequests,
  products,
  reviews,
  systemSettings,
  users,
  walletTransactions,
  wallets,
  productViews,
  productLikes,
  sellerFollows,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Orders (delete helper) ─────────────────────────────────────────────────
export async function deleteOrderById(orderId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(orders).where(eq(orders.id, orderId));
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateUser(id: number, data: Partial<User>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, id));
}

export async function getAllUsers(limit = 50, offset = 0): Promise<User[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).limit(limit).offset(offset).orderBy(desc(users.createdAt));
}

export async function getPendingKycUsers(): Promise<User[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.kycStatus, "pending")).orderBy(users.kycSubmittedAt);
}

// ─── Categories ───────────────────────────────────────────────────────────────
export async function getCategories(): Promise<Category[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categories).orderBy(categories.sortOrder);
}

export async function createCategory(data: { name: string; slug: string; icon?: string }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(categories).values(data);
}

// ─── Products ─────────────────────────────────────────────────────────────────
export async function getProducts(opts: {
  categoryId?: number;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: string;
  listingType?: "c2c" | "b2b" | "both";
  hasVideo?: boolean;
  hasWholesaleTiers?: boolean;
  sellerIds?: number[];
  status?: string;
  allStatuses?: boolean; // ถ้า true จะไม่กรอง status (ใช้สำหรับ seller dashboard)
  sellerId?: number;
  limit?: number;
  offset?: number;
  sortBy?: "smart" | "popular" | "newest" | "price_asc" | "price_desc";
  userId?: number; // สำหรับ personalization
  seed?: number; // random seed จาก client เพื่อหมุนเวียน feed
}): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];

  if (opts.sellerIds !== undefined && opts.sellerIds.length === 0) return [];

  const conditions = [];
  if (opts.allStatuses) {
    // ดึงทุก status ยกเว้น deleted — สินค้าที่ลบแล้วไม่ควรแสดง
    conditions.push(sql`${products.status} != 'deleted'`);
  } else if (opts.status) {
    conditions.push(eq(products.status, opts.status as Product["status"]));
  } else {
    conditions.push(eq(products.status, "active"));
  }
  if (opts.categoryId) conditions.push(eq(products.categoryId, opts.categoryId));
  if (opts.search) conditions.push(
    or(
      like(products.title, `%${opts.search}%`),
      like(products.description, `%${opts.search}%`)
    )!
  );
  if (opts.condition) conditions.push(eq(products.condition, opts.condition as Product["condition"]));
  if (opts.sellerId) conditions.push(eq(products.sellerId, opts.sellerId));
  if (opts.minPrice !== undefined) conditions.push(sql`${products.price} >= ${opts.minPrice}`);
  if (opts.maxPrice !== undefined) conditions.push(sql`${products.price} <= ${opts.maxPrice}`);
  if (opts.listingType) {
    conditions.push(
      or(
        eq(products.listingType, opts.listingType),
        eq(products.listingType, "both")
      )!
    );
  }
  if (opts.hasVideo) conditions.push(sql`${products.videoUrl} IS NOT NULL AND ${products.videoUrl} != ''`);
  if (opts.hasWholesaleTiers) {
    conditions.push(sql`JSON_LENGTH(${products.priceTiers}) > 0`);
  }
  if (opts.sellerIds?.length) {
    conditions.push(inArray(products.sellerId, opts.sellerIds));
  }

  const sortBy = opts.sortBy ?? "smart";

  // ─── Simple sorts ────────────────────────────────────────────────────────────────
  if (sortBy === "newest") {
    return db.select().from(products).where(and(...conditions))
      .orderBy(desc(products.createdAt)).limit(opts.limit ?? 20).offset(opts.offset ?? 0);
  }
  if (sortBy === "price_asc") {
    return db.select().from(products).where(and(...conditions))
      .orderBy(asc(sql`CAST(${products.price} AS DECIMAL)`)).limit(opts.limit ?? 20).offset(opts.offset ?? 0);
  }
  if (sortBy === "price_desc") {
    return db.select().from(products).where(and(...conditions))
      .orderBy(desc(sql`CAST(${products.price} AS DECIMAL)`)).limit(opts.limit ?? 20).offset(opts.offset ?? 0);
  }

  // ─── Popular sort: likeCount×3 + viewCount×1 ────────────────────────────────────────────
  if (sortBy === "popular") {
    const likeSubq = db
      .select({ productId: productLikes.productId, likeCount: count().as("likeCount") })
      .from(productLikes)
      .groupBy(productLikes.productId)
      .as("likeSubq");
    const rows = await db
      .select({ product: products, likeCount: likeSubq.likeCount })
      .from(products)
      .leftJoin(likeSubq, eq(products.id, likeSubq.productId))
      .where(and(...conditions))
      .orderBy(
        desc(sql`COALESCE(${likeSubq.likeCount},0)*3 + COALESCE(${products.viewCount},0)`)
      )
      .limit(opts.limit ?? 20)
      .offset(opts.offset ?? 0);
    return rows.map((r) => r.product);
  }

  // ─── Smart sort (default): popularity + freshness + personal boost ───────────────────
  // freshness = 1 / (1 + age_in_days * 0.05)  — สินค้าใหม่ได้คะแนนเพิ่มขึ้นเล็กน้อย
  // personalBoost = 2.0 ถ้า category ตรงกับ top-3 ที่ผู้ใช้เคยดู, 1.0 ถ้าไม่มีข้อมูล
  let topCategoryIds: number[] = [];
  if (opts.userId) {
    topCategoryIds = await getTopCategories(opts.userId, 3);
  }

  const likeSubq2 = db
    .select({ productId: productLikes.productId, likeCount: count().as("likeCount") })
    .from(productLikes)
    .groupBy(productLikes.productId)
    .as("likeSubq2");

  const personalBoostExpr = topCategoryIds.length > 0
    ? sql`IF(${products.categoryId} IN (${sql.join(topCategoryIds.map((id) => sql`${id}`), sql`, `)}), 2.0, 1.0)`
    : sql`1.0`;

  // randomSeed: ใช้ seed จาก client ถ้ามี มิฉะนั้น fallback เปลี่ยนทุก 30 นาที
  const randomSeed = opts.seed ?? Math.floor(Date.now() / (30 * 60 * 1000));

  // สูตรใหม่: ใช้ log-score เพื่อลดอิทธิพลของสินค้าที่มี likes/views สูงมาก และเพิ่ม random weight เป็น 50%
  const scoreExpr = sql`
    (LOG10(COALESCE(${likeSubq2.likeCount},0)*3 + COALESCE(${products.viewCount},0) + 2))
    * (1.0 / (1.0 + DATEDIFF(NOW(), ${products.createdAt}) * 0.05))
    * ${personalBoostExpr}
    * (0.5 + 1.0 * RAND(${products.id} * 31337 + ${randomSeed}))
  `;

  const rows = await db
    .select({ product: products, likeCount: likeSubq2.likeCount })
    .from(products)
    .leftJoin(likeSubq2, eq(products.id, likeSubq2.productId))
    .where(and(...conditions))
    .orderBy(desc(scoreExpr))
    .limit(opts.limit ?? 20)
    .offset(opts.offset ?? 0);
  return rows.map((r) => r.product);
}

export async function getProductById(id: number): Promise<Product | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0];
}

export async function createProduct(data: {
  sellerId: number;
  categoryId?: number;
  title: string;
  description?: string;
  price: string;
  condition: Product["condition"];
  images: string[];
  videoUrl?: string;
  videoKey?: string;
  location?: string;
  quantity?: number;
  contactPhone?: string;
  contactLineId?: string;
  contactFacebookUrl?: string;
  shippingFee?: number;
  allowCod?: boolean;
  allowWallet?: boolean;
  allowPromptpay?: boolean;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  promptpayNumber?: string;
  promptpayQrUrl?: string;
  promptpayQrKey?: string;
  deliveryDays?: number;
  conditionPercent?: number;
  originalPrice?: string;
  salePrice?: string;
  retailPrice?: string;
  priceTiers?: { minQty: number; pricePerUnit: number }[];
  listingType?: Product["listingType"];
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(products).values({
    ...data,
    images: data.images,
    listingType: data.listingType ?? "both",
    status: "pending_approval",
    shippingFee: (data.shippingFee ?? 0).toFixed(2),
    allowCod: data.allowCod ?? false,
    allowWallet: data.allowWallet ?? false,
    allowPromptpay: data.allowPromptpay ?? false,
    bankName: data.bankName ?? null,
    bankAccountNumber: data.bankAccountNumber ?? null,
    bankAccountName: data.bankAccountName ?? null,
    promptpayQrUrl: data.promptpayQrUrl ?? null,
    promptpayQrKey: data.promptpayQrKey ?? null,
    deliveryDays: data.deliveryDays ?? 3,
  });
  return (result as any)[0]?.insertId ?? 0;
}

export async function getPendingProducts(limit = 50, offset = 0): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(products)
    .where(eq(products.status, "pending_approval"))
    .orderBy(products.createdAt)
    .limit(limit)
    .offset(offset);
}

export async function getPendingFeeProducts(sellerId: number): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(products)
    .where(and(eq(products.sellerId, sellerId), eq(products.status, "pending_fee")))
    .orderBy(desc(products.createdAt));
}

// ─── Listing Fee Slips ───────────────────────────────────────────────────────
export async function createListingFeeSlip(data: {
  productId: number;
  sellerId: number;
  slipUrl: string;
  slipKey: string;
  feeAmount: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(listingFeeSlips).values({
    ...data,
    feeAmount: data.feeAmount.toFixed(2),
    status: "pending",
  });
  return (result as any)[0]?.insertId ?? 0;
}

export async function getListingFeeSlipsByProduct(productId: number): Promise<ListingFeeSlip[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(listingFeeSlips).where(eq(listingFeeSlips.productId, productId)).orderBy(desc(listingFeeSlips.createdAt));
}

export async function getPendingListingFeeSlips(): Promise<ListingFeeSlip[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(listingFeeSlips).where(eq(listingFeeSlips.status, "pending")).orderBy(listingFeeSlips.createdAt);
}

export async function updateListingFeeSlipStatus(
  id: number,
  status: ListingFeeSlip["status"],
  reviewedBy: number,
  reviewNote?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(listingFeeSlips)
    .set({ status, reviewedBy, reviewNote, reviewedAt: new Date() })
    .where(eq(listingFeeSlips.id, id));
}

export async function createListingFeeTransaction(data: {
  productId: number;
  sellerId: number;
  feeRate: number;
  feeAmount: number;
  productPrice: number;
  walletId?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  approvedBy: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(listingFeeTransactions).values({
    productId: data.productId,
    sellerId: data.sellerId,
    feeRate: data.feeRate.toFixed(2),
    feeAmount: data.feeAmount.toFixed(2),
    productPrice: data.productPrice.toFixed(2),
    walletId: data.walletId,
    balanceBefore: data.balanceBefore !== undefined ? data.balanceBefore.toFixed(2) : undefined,
    balanceAfter: data.balanceAfter !== undefined ? data.balanceAfter.toFixed(2) : undefined,
    approvedBy: data.approvedBy,
  });
}

export async function updateProduct(id: number, data: Partial<Product>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function incrementProductView(id: number, userId?: number, categoryId?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // เพิ่ม viewCount ใน products table
  await db.update(products).set({ viewCount: sql`${products.viewCount} + 1` }).where(eq(products.id, id));
  // บันทึก view event สำหรับ personalization (เก็บแค่ 30 วันล่าสุด)
  await db.insert(productViews).values({ userId: userId ?? null, productId: id, categoryId: categoryId ?? null });
}

/** ดึง top N categories ที่ผู้ใช้เคยดูมากที่สุดใน 30 วันล่าสุด */
export async function getTopCategories(userId: number, topN = 3): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ categoryId: productViews.categoryId, cnt: count().as("cnt") })
    .from(productViews)
    .where(
      and(
        eq(productViews.userId, userId),
        sql`${productViews.viewedAt} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        sql`${productViews.categoryId} IS NOT NULL`
      )
    )
    .groupBy(productViews.categoryId)
    .orderBy(desc(sql`cnt`))
    .limit(topN);
  return rows.map((r) => r.categoryId as number);
}

export async function getFollowedSellerIds(followerId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ sellerId: sellerFollows.sellerId })
    .from(sellerFollows)
    .where(eq(sellerFollows.followerId, followerId));
  return rows.map((r) => r.sellerId);
}

export async function countProducts(opts: {
  status?: string;
  sellerId?: number;
  categoryId?: number;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: string;
  listingType?: "c2c" | "b2b" | "both";
  hasVideo?: boolean;
  hasWholesaleTiers?: boolean;
  sellerIds?: number[];
} = {}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  if (opts.sellerIds !== undefined && opts.sellerIds.length === 0) return 0;
  const conditions = [];
  if (opts.status) conditions.push(eq(products.status, opts.status as Product["status"]));
  if (opts.sellerId) conditions.push(eq(products.sellerId, opts.sellerId));
  if (opts.categoryId) conditions.push(eq(products.categoryId, opts.categoryId));
  if (opts.search) conditions.push(
    or(
      like(products.title, `%${opts.search}%`),
      like(products.description, `%${opts.search}%`)
    )!
  );
  if (opts.condition) conditions.push(eq(products.condition, opts.condition as Product["condition"]));
  if (opts.minPrice !== undefined) conditions.push(sql`${products.price} >= ${opts.minPrice}`);
  if (opts.maxPrice !== undefined) conditions.push(sql`${products.price} <= ${opts.maxPrice}`);
  if (opts.listingType) {
    conditions.push(
      or(
        eq(products.listingType, opts.listingType),
        eq(products.listingType, "both")
      )!
    );
  }
  if (opts.hasVideo) conditions.push(sql`${products.videoUrl} IS NOT NULL AND ${products.videoUrl} != ''`);
  if (opts.hasWholesaleTiers) {
    conditions.push(sql`JSON_LENGTH(${products.priceTiers}) > 0`);
  }
  if (opts.sellerIds?.length) {
    conditions.push(inArray(products.sellerId, opts.sellerIds));
  }
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(conditions.length ? and(...conditions) : undefined);
  return result[0]?.count ?? 0;
}

// ─── Wallets ──────────────────────────────────────────────────────────────────
export async function getOrCreateWallet(userId: number): Promise<Wallet> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(wallets).values({ userId, balance: "0.00" });
  const created = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return created[0]!;
}

export async function getWalletByUserId(userId: number): Promise<Wallet | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return result[0];
}

export async function addWalletTransaction(data: {
  walletId: number;
  userId: number;
  type: WalletTransaction["type"];
  amount: number;
  referenceId?: number;
  referenceType?: string;
  note?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get current balance
  const wallet = await db.select().from(wallets).where(eq(wallets.id, data.walletId)).limit(1);
  if (!wallet[0]) throw new Error("Wallet not found");

  const balanceBefore = parseFloat(wallet[0].balance as string);
  let balanceAfter = balanceBefore;

  if (["topup", "refund", "escrow_release"].includes(data.type)) {
    balanceAfter = balanceBefore + data.amount;
  } else if (["purchase", "fee", "payout", "escrow_hold"].includes(data.type)) {
    balanceAfter = balanceBefore - data.amount;
  }

  await db.insert(walletTransactions).values({
    walletId: data.walletId,
    userId: data.userId,
    type: data.type,
    amount: data.amount.toFixed(2),
    balanceBefore: balanceBefore.toFixed(2),
    balanceAfter: balanceAfter.toFixed(2),
    referenceId: data.referenceId,
    referenceType: data.referenceType,
    note: data.note,
  });

  await db
    .update(wallets)
    .set({ balance: balanceAfter.toFixed(2) })
    .where(eq(wallets.id, data.walletId));
}

export async function getWalletTransactions(userId: number, limit = 20, offset = 0): Promise<WalletTransaction[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, userId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}

// ─── Orders ───────────────────────────────────────────────────────────────────
export async function createOrder(data: {
  buyerId: number;
  sellerId: number;
  productId: number;
  productTitle: string;
  productImage?: string;
  amount: number;
  shippingFee?: number;
  codFee?: number;
  shippingAddress?: string;
  paymentMethod: Order["paymentMethod"];
  sellerPromptpay?: string;
  sellerPromptpayQrUrl?: string;
  sellerBankName?: string;
  sellerBankAccountName?: string;
  sellerBankAccountNumber?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const shippingFee = data.shippingFee ?? 0;
  const codFee = data.codFee ?? 0;
  const totalAmount = data.amount + shippingFee + codFee;
  const result = await db.insert(orders).values({
    buyerId: data.buyerId,
    sellerId: data.sellerId,
    productId: data.productId,
    productTitle: data.productTitle,
    productImage: data.productImage,
    amount: data.amount.toFixed(2),
    shippingFee: shippingFee.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    feeRate: "0.00",
    feeAmount: codFee.toFixed(2),
    sellerReceives: data.amount.toFixed(2),
    status: "pending_payment", // COD starts at pending_payment — seller confirms first
    paymentMethod: data.paymentMethod,
    shippingAddress: data.shippingAddress,
    sellerPromptpay: data.sellerPromptpay,
    sellerPromptpayQrUrl: data.sellerPromptpayQrUrl,
    sellerBankName: data.sellerBankName,
    sellerBankAccountName: data.sellerBankAccountName,
    sellerBankAccountNumber: data.sellerBankAccountNumber,
  });
  return (result as any)[0]?.insertId ?? 0;
}

export async function getOrderById(id: number): Promise<Order | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return result[0];
}

export async function getOrdersByBuyer(buyerId: number, limit = 20, offset = 0): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(orders)
    .where(eq(orders.buyerId, buyerId))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getOrdersBySeller(sellerId: number, limit = 20, offset = 0): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(orders)
    .where(eq(orders.sellerId, sellerId))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getAllOrders(limit = 50, offset = 0): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit).offset(offset);
}

export async function updateOrderStatus(id: number, status: Order["status"], extra?: Partial<Order>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const data: Partial<Order> = { status, ...extra };
  if (status === "completed") data.completedAt = new Date();
  if (status === "cancelled") data.cancelledAt = new Date();
  await db.update(orders).set(data).where(eq(orders.id, id));
}

export async function countOrders(opts: { status?: string } = {}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conditions = opts.status ? [eq(orders.status, opts.status as Order["status"])] : [];
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(conditions.length ? and(...conditions) : undefined);
  return result[0]?.count ?? 0;
}

// ─── Payment Slips ────────────────────────────────────────────────────────────
export async function createPaymentSlip(data: {
  orderId: number;
  uploadedBy: number;
  slipUrl: string;
  slipKey: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(paymentSlips).values({ ...data, status: "pending" });
  return (result as any)[0]?.insertId ?? 0;
}

export async function getSlipsByOrder(orderId: number): Promise<PaymentSlip[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(paymentSlips).where(eq(paymentSlips.orderId, orderId)).orderBy(desc(paymentSlips.createdAt));
}

export async function getPendingSlips(): Promise<PaymentSlip[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(paymentSlips).where(eq(paymentSlips.status, "pending")).orderBy(paymentSlips.createdAt);
}

export async function updateSlipStatus(
  id: number,
  status: PaymentSlip["status"],
  reviewedBy: number,
  reviewNote?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(paymentSlips)
    .set({ status, reviewedBy, reviewNote, reviewedAt: new Date() })
    .where(eq(paymentSlips.id, id));
}

// ─── Payout Requests ──────────────────────────────────────────────────────────
export async function createPayoutRequest(data: {
  sellerId: number;
  orderId?: number;
  amount: number;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankName?: string;
  promptpayNumber?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(payoutRequests).values({
    ...data,
    amount: data.amount.toFixed(2),
    status: "pending",
  });
  return (result as any)[0]?.insertId ?? 0;
}

export async function getPayoutRequestsBySeller(sellerId: number): Promise<PayoutRequest[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(payoutRequests)
    .where(eq(payoutRequests.sellerId, sellerId))
    .orderBy(desc(payoutRequests.createdAt));
}

export async function getPayoutRequestById(id: number): Promise<PayoutRequest | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(payoutRequests).where(eq(payoutRequests.id, id)).limit(1);
  return result[0];
}

export async function getAllPayoutRequests(limit = 50, offset = 0): Promise<PayoutRequest[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payoutRequests).orderBy(desc(payoutRequests.createdAt)).limit(limit).offset(offset);
}

export async function updatePayoutStatus(
  id: number,
  status: PayoutRequest["status"],
  processedBy: number,
  adminNote?: string,
  transferSlipUrl?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(payoutRequests)
    .set({ status, processedBy, adminNote, transferSlipUrl, processedAt: new Date() })
    .where(eq(payoutRequests.id, id));
}

// ─── Reviews ──────────────────────────────────────────────────────────────────
export async function createReview(data: {
  orderId: number;
  reviewerId: number;
  sellerId: number;
  productId: number;
  rating: number;
  comment?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(reviews).values(data);
}

export async function getReviewsByProduct(productId: number): Promise<Review[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reviews).where(eq(reviews.productId, productId)).orderBy(desc(reviews.createdAt));
}

export async function getReviewsBySeller(sellerId: number, limit = 20): Promise<Review[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reviews)
    .where(eq(reviews.sellerId, sellerId))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}

export async function getReviewByOrder(orderId: number): Promise<Review | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reviews).where(eq(reviews.orderId, orderId)).limit(1);
  return result[0];
}

export async function getSellerRating(sellerId: number): Promise<{ avg: number; count: number }> {
  const db = await getDb();
  if (!db) return { avg: 0, count: 0 };
  const result = await db
    .select({
      avg: sql<number>`AVG(${reviews.rating})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(reviews)
    .where(eq(reviews.sellerId, sellerId));
  return { avg: result[0]?.avg ?? 0, count: result[0]?.count ?? 0 };
}

// ─── System Settings ──────────────────────────────────────────────────────────
export async function getSystemSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function getAllSystemSettings(): Promise<SystemSetting[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(systemSettings);
}

export async function setSystemSetting(key: string, value: string, updatedBy?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(systemSettings)
    .values({ key, value, updatedBy })
    .onDuplicateKeyUpdate({ set: { value, updatedBy } });
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalUsers] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [totalProducts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.status, "active"));
  const [totalOrders] = await db.select({ count: sql<number>`count(*)` }).from(orders);
  const [completedOrders] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.status, "completed"));
  const [pendingSlips] = await db
    .select({ count: sql<number>`count(*)` })
    .from(paymentSlips)
    .where(eq(paymentSlips.status, "pending"));
  const [pendingKyc] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.kycStatus, "pending"));
  const [pendingPayouts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(payoutRequests)
    .where(eq(payoutRequests.status, "pending"));
  const [pendingProducts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.status, "pending_approval"));
  return {
    totalUsers: totalUsers?.count ?? 0,
    totalProducts: totalProducts?.count ?? 0,
    totalOrders: totalOrders?.count ?? 0,
    completedOrders: completedOrders?.count ?? 0,
    totalRevenue: 0,
    pendingSlips: pendingSlips?.count ?? 0,
    pendingKyc: pendingKyc?.count ?? 0,
    pendingPayouts: pendingPayouts?.count ?? 0,
    pendingProducts: pendingProducts?.count ?? 0,
  };
}
