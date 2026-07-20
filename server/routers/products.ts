import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  countProducts,
  createProduct,
  getCategories,
  getFollowedSellerIds,
  getPendingProducts,
  getProductById,
  getProducts,
  getUserById,
  incrementProductView,
  updateProduct,
} from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { WholesalePriceTierError, normalizeWholesalePriceTiers } from "../../shared/wholesale-pricing";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";
import { enhancedImageAnalysis, cosineSimilarity } from "../imageAnalysis";
import type { Product } from "../../drizzle/schema";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin เท่านั้น" });
  return next({ ctx });
});

export const productsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        categoryId: z.number().optional(),
        search: z.string().optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        condition: z.string().optional(),
        listingType: z.enum(["c2c", "b2b", "both"]).optional(),
        hasVideo: z.boolean().optional(),
        hasWholesaleTiers: z.boolean().optional(),
        followedOnly: z.boolean().optional(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().default(0),
        sortBy: z.enum(["smart", "popular", "newest", "price_asc", "price_desc"]).default("smart"),
        seed: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      let sellerIds: number[] | undefined;
      if (input.followedOnly) {
        if (!userId) return { items: [], total: 0 };
        sellerIds = await getFollowedSellerIds(userId);
        if (sellerIds.length === 0) return { items: [], total: 0 };
      }

      const queryOpts = {
        ...input,
        status: "active" as const,
        userId,
        sellerIds,
      };
      const items = await getProducts(queryOpts);
      const total = await countProducts({
        status: "active",
        categoryId: input.categoryId,
        search: input.search,
        minPrice: input.minPrice,
        maxPrice: input.maxPrice,
        condition: input.condition,
        listingType: input.listingType,
        hasVideo: input.hasVideo,
        hasWholesaleTiers: input.hasWholesaleTiers,
        sellerIds,
      });
      return { items, total };
    }),

  getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const product = await getProductById(input.id);
    if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสินค้า" });
    await incrementProductView(input.id, ctx.user?.id, product.categoryId ?? undefined);
    // Attach seller info
    const seller = await getUserById(product.sellerId);
    // Merge: product-level contact overrides seller profile (fallback to seller profile)
    const effectivePhone = (product as any).contactPhone || seller?.phone || null;
    const effectiveLineId = (product as any).contactLineId || seller?.lineId || null;
    const effectiveFacebookUrl = (product as any).contactFacebookUrl || seller?.facebookUrl || null;
    return {
      ...product,
      seller: seller
        ? {
            id: seller.id,
            name: seller.name,
            avatar: seller.avatar,
            phone: effectivePhone,
            lineId: effectiveLineId,
            facebookUrl: effectiveFacebookUrl,
            email: seller.email,
            province: seller.province,
            address: seller.address,
            kycStatus: seller.kycStatus,
            createdAt: seller.createdAt,
          }
        : null,
    };
  }),

  getMySelling: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
        status: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await getProducts({
        sellerId: ctx.user.id,
        // ถ้าไม่ระบุ status ให้ดึงทุก status เพื่อให้ผู้ขายเห็นสินค้าที่ซ่อนอยู่ด้วย
        ...(input.status ? { status: input.status } : { allStatuses: true }),
        limit: input.limit,
        offset: input.offset,
      });
      const total = await countProducts({ sellerId: ctx.user.id });
      return { items, total };
    }),

  create: protectedProcedure
    .input(
      z.object({
        categoryId: z.number().optional(),
        title: z.string().min(5).max(255),
        description: z.string().optional(),
        price: z.number().min(1),
        condition: z.enum(["new", "like_new", "good", "fair", "poor"]),
        images: z.array(z.string()).min(1).max(10),
        location: z.string().optional(),
        videoUrl: z.string().optional(),
        quantity: z.number().int().min(1).max(9999).default(1),
        contactPhone: z.string().max(20).optional(),
        contactLineId: z.string().max(64).optional(),
        contactFacebookUrl: z.string().max(255).optional(),
        shippingFee: z.number().min(0).default(0),
        allowCod: z.boolean().default(false),
        allowWallet: z.boolean().default(false),
        allowPromptpay: z.boolean().default(false),
        bankName: z.string().max(64).optional(),
        bankAccountNumber: z.string().max(20).optional(),
        bankAccountName: z.string().optional(),
        promptpayNumber: z.string().max(20).optional(),
        promptpayQrUrl: z.string().optional(),
        promptpayQrKey: z.string().optional(),
        deliveryDays: z.number().int().min(1).max(30).default(3),
        conditionPercent: z.number().int().min(0).max(100).optional(),
        originalPrice: z.number().min(0).optional(),
        salePrice: z.number().min(0).optional(),
        retailPrice: z.number().min(0).optional(),
        priceTiers: z.array(z.object({ minQty: z.number().int().min(1), pricePerUnit: z.number().min(0) })).optional(),
        listingType: z.enum(["c2c", "b2b", "both"]).default("both"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.isSeller) {
        throw new TRPCError({ code: "FORBIDDEN", message: "คุณยังไม่ได้เปิดใช้งานบัญชีผู้ขาย" });
      }
      if (ctx.user.kycStatus !== "approved") {
        throw new TRPCError({ code: "FORBIDDEN", message: "กรุณายืนยันตัวตน (KYC) ก่อนลงขายสินค้า" });
      }

      // Validate: at least one payment method must be selected
      if (!input.allowCod && !input.allowWallet && !input.allowPromptpay) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "กรุณาเลือกวิธีรับเงินอย่างน้อย 1 วิธี" });
      }

      // Validate: if PromptPay is selected, require bank details or QR code
      if (input.allowPromptpay && !input.bankAccountNumber && !input.promptpayQrUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "กรุณากรอกเลขบัญชีหรืออัปโหลด QR Code PromptPay" });
      }

      let normalizedTiers: { minQty: number; pricePerUnit: number }[] = [];
      try {
        normalizedTiers = normalizeWholesalePriceTiers(input.price, input.priceTiers);
      } catch (err) {
        if (err instanceof WholesalePriceTierError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }

      // Create product directly as pending_approval (no listing fee)
      const id = await createProduct({
        sellerId: ctx.user.id,
        categoryId: input.categoryId,
        title: input.title,
        description: input.description,
        price: input.price.toFixed(2),
        condition: input.condition,
        images: input.images,
        location: input.location,
        videoUrl: input.videoUrl,
        quantity: input.quantity,
        contactPhone: input.contactPhone,
        contactLineId: input.contactLineId,
        contactFacebookUrl: input.contactFacebookUrl,
        shippingFee: input.shippingFee,
        allowCod: input.allowCod,
        allowWallet: input.allowWallet,
        allowPromptpay: input.allowPromptpay,
        bankName: input.bankName,
        bankAccountNumber: input.bankAccountNumber,
        bankAccountName: input.bankAccountName,
        promptpayNumber: input.promptpayNumber,
        promptpayQrUrl: input.promptpayQrUrl,
        promptpayQrKey: input.promptpayQrKey,
        deliveryDays: input.deliveryDays,
        conditionPercent: input.conditionPercent,
        originalPrice: input.originalPrice !== undefined ? input.originalPrice.toFixed(2) : undefined,
        salePrice: input.salePrice !== undefined ? input.salePrice.toFixed(2) : undefined,
        retailPrice: input.retailPrice !== undefined ? input.retailPrice.toFixed(2) : undefined,
        priceTiers: normalizedTiers,
        listingType: input.listingType,
      });

      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        categoryId: z.number().optional(),
        title: z.string().min(5).max(255).optional(),
        description: z.string().optional(),
        price: z.number().min(1).optional(),
        condition: z.enum(["new", "like_new", "good", "fair", "poor"]).optional(),
        images: z.array(z.string()).optional(),
        location: z.string().optional(),
        status: z.enum(["draft", "active", "hidden"]).optional(),
        quantity: z.number().int().min(1).max(9999).optional(),
        contactPhone: z.string().max(20).optional(),
        contactLineId: z.string().max(64).optional(),
        contactFacebookUrl: z.string().max(255).optional(),
        shippingFee: z.number().min(0).optional(),
        allowCod: z.boolean().optional(),
        allowWallet: z.boolean().optional(),
        allowPromptpay: z.boolean().optional(),
        bankName: z.string().max(64).optional(),
        bankAccountNumber: z.string().max(20).optional(),
        bankAccountName: z.string().optional(),
        promptpayNumber: z.string().max(20).optional(),
        promptpayQrUrl: z.string().optional(),
        promptpayQrKey: z.string().optional(),
        deliveryDays: z.number().int().min(1).max(30).optional(),
        conditionPercent: z.number().int().min(0).max(100).optional(),
        originalPrice: z.number().min(0).optional(),
        salePrice: z.number().min(0).optional(),
        retailPrice: z.number().min(0).optional(),
        priceTiers: z.array(z.object({ minQty: z.number().int().min(1), pricePerUnit: z.number().min(0) })).optional(),
        listingType: z.enum(["c2c", "b2b", "both"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const product = await getProductById(input.id);
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      if (product.sellerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { id, price, shippingFee, originalPrice, salePrice, retailPrice, priceTiers, ...rest } = input;
      const updateData: any = { ...rest };
      if (price !== undefined) updateData.price = price.toFixed(2);
      if (shippingFee !== undefined) updateData.shippingFee = shippingFee.toFixed(2);
      if (originalPrice !== undefined) updateData.originalPrice = originalPrice.toFixed(2);
      if (salePrice !== undefined) updateData.salePrice = salePrice.toFixed(2);
      if (retailPrice !== undefined) updateData.retailPrice = retailPrice.toFixed(2);

      if (priceTiers !== undefined) {
        const base = price ?? parseFloat(String(product.price));
        try {
          updateData.priceTiers = normalizeWholesalePriceTiers(base, priceTiers);
        } catch (err) {
          if (err instanceof WholesalePriceTierError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
          throw err;
        }
      }

      await updateProduct(id, updateData);
      return { success: true };
    }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const product = await getProductById(input.id);
    if (!product) throw new TRPCError({ code: "NOT_FOUND" });
    if (product.sellerId !== ctx.user.id && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    await updateProduct(input.id, { status: "deleted" });
    return { success: true };
  }),

  uploadImage: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        base64: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const key = `products/${ctx.user.id}/${Date.now()}-${input.filename}`;
      const { url } = await storagePut(key, buffer, input.contentType);
      return { url };
    }),

  uploadVideo: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        base64: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const key = `products/videos/${ctx.user.id}/${Date.now()}-${input.filename}`;
      const { url } = await storagePut(key, buffer, input.contentType);
      return { url };
    }),

  categories: publicProcedure.query(async () => {
    return getCategories();
  }),

  // ─── Admin procedures ──────────────────────────────────────────────────────
  adminPendingProducts: adminProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const items = await getPendingProducts(input.limit, input.offset);
      const withSellers = await Promise.all(
        items.map(async (p) => {
          const seller = await getUserById(p.sellerId);
          return { ...p, seller, latestFeeSlip: null };
        })
      );
      return withSellers;
    }),

  adminApproveProduct: adminProcedure
    .input(z.object({ productId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const product = await getProductById(input.productId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      if (product.status !== "pending_approval") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "สินค้าไม่ได้อยู่ในสถานะรออนุมัติ" });
      }

      // Activate product directly (no fee collection)
      // Set expiresAt = 30 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await updateProduct(input.productId, {
        status: "active",
        approvedAt: new Date(),
        approvedBy: ctx.user.id,
        expiresAt,
      });

      return { success: true };
    }),

  adminRejectProduct: adminProcedure
    .input(z.object({ productId: z.number(), note: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const product = await getProductById(input.productId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });

      await updateProduct(input.productId, {
        status: "rejected",
        rejectedNote: input.note,
      });

      return { success: true };
    }),

  // ─── Listing Lifecycle ─────────────────────────────────────────────────────────────────────────

  /** ต่ออายุประกาศ +30 วัน */
  renewListing: protectedProcedure
    .input(z.object({ productId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const product = await getProductById(input.productId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      if (product.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (product.status === "sold" || product.status === "deleted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่สามารถต่ออายุสินค้าที่ขายแล้วหรือถูกลบแล้ว" });
      }

      // คำนวณวันหมดอายุใหม่: ถ้ายังไม่หมดอายุ ต่อจากวันหมดอายุเดิม, ถ้าหมดแล้ว ต่อจากวันนี้
      const base = product.expiresAt && new Date(product.expiresAt) > new Date()
        ? new Date(product.expiresAt)
        : new Date();
      base.setDate(base.getDate() + 30);

      await updateProduct(input.productId, {
        status: "active",
        expiresAt: base,
        renewedAt: new Date(),
        renewCount: ((product as any).renewCount ?? 0) + 1,
      });

      return { success: true, newExpiresAt: base };
    }),

    /** ปิดประกาศ "ขายแล้ว" — ต้องอัปโหลดสลิปยืนยันก่อน */
  markAsSold: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        saleSlipBase64: z.string().min(1, "กรุณาอัปโหลดสลิปยืนยันการขาย"),
        saleSlipFilename: z.string().default("slip.jpg"),
        saleSlipContentType: z.string().default("image/jpeg"),
        saleAmount: z.number().optional(), // ยอดขายจริง (ถ้ามี)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const product = await getProductById(input.productId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      if (product.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (product.status === "sold") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "สินค้านี้ถูกทำเครื่องหมายขายแล้ว" });
      }

      // อัปโหลดสลิปไปยัง storage
      const buffer = Buffer.from(input.saleSlipBase64, "base64");
      const key = `sale-slips/${ctx.user.id}/${Date.now()}-${input.saleSlipFilename}`;
      const { url: saleSlipUrl } = await storagePut(key, buffer, input.saleSlipContentType);

      // ตรวจสอบสลิปด้วย Vision AI (optional — ถ้า fail ก็ยังอนุญาตให้ mark sold ได้)
      let verifyNote = "";
      let confidence = 0;
      try {
        const { verifySlip } = await import("../slipVerifier");
        const saleAmount = input.saleAmount ?? parseFloat(String((product as any).price ?? 0));
        const verifyResult = await verifySlip(saleSlipUrl, {
          totalAmount: saleAmount,
          sellerBankAccountName: (product as any).bankAccountName ?? null,
          sellerBankAccountNumber: (product as any).bankAccountNumber ?? null,
          sellerBankName: (product as any).bankName ?? null,
          sellerPromptpay: (product as any).promptpayNumber ?? null,
          createdAt: new Date(),
        });
        verifyNote = verifyResult.note;
        confidence = verifyResult.confidence;
      } catch (err) {
        console.warn("[markAsSold] slip verify error:", err);
      }

      await updateProduct(input.productId, {
        status: "sold",
        saleSlipUrl,
        saleSlipKey: key,
        soldAt: new Date(),
      } as any);

      return { success: true, saleSlipUrl, verifyNote, confidence };
    }),

  /** เพิ่ม/ลดสต๊อกสินค้า */
  updateStock: protectedProcedure
    .input(z.object({ productId: z.number(), quantity: z.number().int().min(0).max(9999) }))
    .mutation(async ({ ctx, input }) => {
      const product = await getProductById(input.productId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      if (product.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      // ถ้าสต๊อก > 0 และสินค้าเป็น sold ให้เปลี่ยนกลับเป็น active
      const newStatus = input.quantity > 0 && product.status === "sold" ? "active" : undefined;
      await updateProduct(input.productId, {
        quantity: input.quantity,
        ...(newStatus ? { status: newStatus } : {}),
      });
      return { success: true, quantity: input.quantity };
    }),

  /** ซ่อน/แสดงประกาศ */
  toggleHide: protectedProcedure
    .input(z.object({ productId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const product = await getProductById(input.productId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      if (product.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const newStatus = product.status === "hidden" ? "active" : "hidden";
      await updateProduct(input.productId, { status: newStatus });
      return { success: true, newStatus };
    }),

  /** ปิดประกาศ "ขายนอกระบบ" — ไม่ต้องอัปโหลดสลิป */
  markSoldExternal: protectedProcedure
    .input(z.object({ productId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const product = await getProductById(input.productId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      if (product.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (product.status === "sold" || product.status === "deleted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "สินค้านี้ถูกปิดประกาศแล้ว" });
      }
      await updateProduct(input.productId, { status: "sold", soldAt: new Date() });
      return { success: true };
    }),

  // ─── Image Search (Visual Similarity) ───────────────────────────────────────
  /**
   * 3-Pass Visual Similarity Search:
   *   Pass 1: Vision AI วิเคราะห์รูปลูกค้า → สร้าง keywords
   *   Pass 2: ดึง candidates จาก DB (ทั้ง keyword match + สินค้าล่าสุด) พร้อมรูปจริง
   *   Pass 3: Vision AI ดูรูปลูกค้า + รูปสินค้าในระบบ → เลือกสินค้าที่ตรงกันมากที่สุด
   */
  searchByImage: publicProcedure
    .input(
      z.object({
        imageData: z.string().min(1), // base64 (ไม่มี data: prefix) หรือ URL
        mimeType: z.string().default("image/jpeg"),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .mutation(async ({ input }) => {
      // สร้าง image URL
      let imageUrl: string;
      if (input.imageData.startsWith("http") || input.imageData.startsWith("/")) {
        imageUrl = input.imageData;
      } else {
        imageUrl = `data:${input.mimeType};base64,${input.imageData}`;
      }

      // ═══ PASS 1: วิเคราะห์รูป → keywords ════════════════════════════════════════════
      let analysis: {
        productName: string;
        brand: string;
        model: string;
        category: string;
        color: string;
        condition: string;
        keywords: string[];
        searchQuery: string;
        confidence: number;
        description: string;
      };

      try {
        const pass1 = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `คุณเป็น AI ผู้เชี่ยวชาญระบุสินค้ามือสองจากรูปภาพ ตอบเป็น JSON เท่านั้น ไม่ต้องมีข้อความอื่น
วิเคราะห์สิ่งที่เห็นในรูปอย่างละเอียด รวมถึงแบรนด์ รุ่น สี สภาพ หมวดหมู่
ใส่ keywords ที่หลากหลาย ทั้งภาษาไทย อังกฤษ ชื่อย่อ คำที่คนไทยใช้ค้นหา
ถ้าไม่แน่ใจให้ระบุสิ่งที่เป็นไปได้หลายตัวใน keywords`,
            },
            {
              role: "user",
              content: [
                { type: "image_url" as const, image_url: { url: imageUrl, detail: "high" as const } },
                {
                  type: "text" as const,
                  text: `วิเคราะห์สิ่งที่เห็นในรูป ตอบ JSON:
{
  "productName": "ชื่อสินค้า (ภาษาไทย)",
  "brand": "แบรนด์",
  "model": "รุ่น",
  "category": "หมวดหมู่",
  "color": "สี",
  "condition": "สภาพ",
  "keywords": ["คำค้นหา 1", "คำค้นหา 2", "คำค้นหา 3", "คำค้นหา 4", "คำค้นหา 5", "คำค้นหา 6", "คำค้นหา 7", "คำค้นหา 8"],
  "searchQuery": "คำค้นหาหลัก (ภาษาไทย)",
  "confidence": 0.9,
  "description": "อธิบายสั้นๆ"
}`,
                },
              ],
            },
          ],
        });
        const c1 = pass1.choices[0]?.message?.content;
        const raw1 = typeof c1 === "string" ? c1 : JSON.stringify(c1);
        // extract JSON จาก markdown code block หรือ raw text
        const jsonMatch1 = raw1.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw1.match(/(\{[\s\S]*\})/);
        analysis = JSON.parse(jsonMatch1 ? jsonMatch1[1] : raw1);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ไม่สามารถวิเคราะห์รูปภาพได้ กรุณาลองใหม่" });
      }

      // ═══ PASS 2: ดึง candidates จาก DB ══════════════════════════════════════════════════
      // ดึงสินค้าหลายชุดจาก DB: keyword match + สินค้าล่าสุด (fallback)
      const candidateMap = new Map<number, Product>();

      // ค้นด้วย keywords ทุกตัว
      const allKeywords = [
        analysis.searchQuery,
        analysis.productName,
        analysis.brand,
        analysis.model,
        ...analysis.keywords,
      ].filter((k) => k && k.trim().length > 0 && k !== "ไม่ทราบ");

      // ค้นแต่ละ keyword (limit น้อยเพื่อควบคุมค่าใช้จ่าย)
      for (const kw of allKeywords.slice(0, 6)) {
        const found = await getProducts({ search: kw, status: "active", limit: 10, offset: 0, sortBy: "popular" });
        for (const p of found) {
          if (!candidateMap.has(p.id)) candidateMap.set(p.id, p);
        }
      }

      // ถ้ายังได้น้อยเกินไป เพิ่มสินค้าล่าสุดเป็น fallback
      if (candidateMap.size < 5) {
        const recent = await getProducts({ status: "active", limit: 20, offset: 0, sortBy: "newest" });
        for (const p of recent) {
          if (!candidateMap.has(p.id)) candidateMap.set(p.id, p);
        }
      }

      const candidates = Array.from(candidateMap.values()).slice(0, 30);

      // ถ้าไม่มีสินค้าในระบบเลย คืนผลเปล่าเลย
      if (candidates.length === 0) {
        return { analysis, items: [], total: 0, searchQuery: analysis.searchQuery };
      }

      // ═══ PASS 3: Vision AI เปรียบรูปลูกค้า vs รูปสินค้าจริง ═════════════════════════════════
      // สร้างรายการสินค้าสำหรับให้ AI ดู
      const productList = candidates.map((p, i) => {
        const firstImage = Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null;
        return {
          index: i,
          id: p.id,
          title: p.title,
          description: p.description ?? "",
          imageUrl: firstImage,
        };
      });

      // สร้าง content สำหรับ Pass 3
      // ส่งรูปลูกค้า + รูปสินค้าที่มีรูปภาพ (max 8 รูป เพื่อควบคุม token)
      const candidatesWithImages = productList.filter((p) => p.imageUrl);
      const candidatesTextOnly = productList.filter((p) => !p.imageUrl);

      // สร้าง message content สำหรับ Pass 3
      type ContentPart =
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail: "low" } };

      const pass3Content: ContentPart[] = [
        {
          type: "text",
          text: `นี่คือรูปสินค้าที่ลูกค้าต้องการค้นหา:`,
        },
        { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
        {
          type: "text",
          text: `ตอนนี้คือรายการสินค้าในระบบ (${candidates.length} รายการ):
${productList.map((p) => `[${p.index}] ID:${p.id} | ชื่อ: ${p.title} | รายละเอียด: ${p.description.slice(0, 80)}`).join("\n")}`,
        },
      ];

      // เพิ่มรูปสินค้า (max 8 รูป)
      for (const p of candidatesWithImages.slice(0, 8)) {
        pass3Content.push({
          type: "text",
          text: `รูปสินค้า [${p.index}] "${p.title}":`,
        });
        pass3Content.push({
          type: "image_url",
          image_url: { url: p.imageUrl!, detail: "low" },
        });
      }

      pass3Content.push({
        type: "text",
        text: `เปรียบเทียบรูปลูกค้ากับสินค้าทั้งหมดแล้วตอบ JSON:
{
  "rankedIds": [รายการ product ID ที่ตรงกันมากที่สุดก่อน เรียงจากตรงที่สุดไปหาน้อยที่สุด],
  "matchReason": "อธิบายว่าทำไมถึงตรงกัน"
}
ให้เลือกเฉพาะสินค้าที่มีความคล้ายคลึงกันจริงๆ ถ้าไม่มีสินค้าใดตรงเลยให้ส่ง rankedIds: []`,
      });

      let rankedIds: number[] = [];
      let matchReason = "";

      try {
        const pass3 = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `คุณเป็น AI เปรียบเทียบความคล้ายคลึงของสินค้าจากรูปภาพ ตอบเป็น JSON เท่านั้น
ดูทั้งรูปลูกค้า ชื่อสินค้า รายละเอียด และรูปสินค้าที่มี เพื่อเปรียบเทียบความคล้ายคลึง`,
            },
            { role: "user", content: pass3Content },
          ],
        });
        const c3 = pass3.choices[0]?.message?.content;
        const raw3 = typeof c3 === "string" ? c3 : JSON.stringify(c3);
        const jsonMatch3 = raw3.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw3.match(/(\{[\s\S]*\})/);
        const parsed = JSON.parse(jsonMatch3 ? jsonMatch3[1] : raw3);
        rankedIds = parsed.rankedIds ?? [];
        matchReason = parsed.matchReason ?? "";
      } catch {
        // Pass 3 ล้มเหลว → ใช้ผลจาก Pass 2 แทน
        rankedIds = candidates.map((p) => p.id);
      }

      // เรียงสินค้าตาม rankedIds ก่อน แล้วเพิ่มสินค้าที่ไม่ได้ถูกเลือกต่อท้าย
      const candidateById = new Map(candidates.map((p) => [p.id, p]));
      const orderedItems: typeof candidates = [];
      const seenIds = new Set<number>();

      for (const id of rankedIds) {
        const p = candidateById.get(id);
        if (p && !seenIds.has(id)) {
          orderedItems.push(p);
          seenIds.add(id);
        }
      }
      // เพิ่มสินค้าที่เหลือที่ไม่ได้ถูก rank
      for (const p of candidates) {
        if (!seenIds.has(p.id)) orderedItems.push(p);
      }

      return {
        analysis: { ...analysis, matchReason },
        items: orderedItems.slice(0, input.limit),
        total: orderedItems.length,
        searchQuery: analysis.searchQuery,
      };
    }),
});
