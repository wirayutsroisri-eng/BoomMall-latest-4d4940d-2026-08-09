import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addWalletTransaction,
  createOrder,
  createPaymentSlip,
  deleteOrderById,
  getAllOrders,
  getOrderById,
  getOrdersByBuyer,
  getOrdersBySeller,
  getPendingSlips,
  getProductById,
  getSlipsByOrder,
  getWalletByUserId,
  updateOrderStatus,
  updateProduct,
  updateSlipStatus,
  getUserById,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { assertImageUploadSize } from "../uploadValidation";
import { verifySlip } from "../slipVerifier";
import { notifyOrderStatusChange, notifyProductSold } from "../_core/pushNotification";
import { getDb } from "../db";
import { conversations, messages } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const ordersRouter = router({
  // Create order (buyer initiates purchase — direct payment to seller)
  create: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        shippingAddress: z.string().min(1),
        paymentMethod: z.enum(["promptpay", "bank_transfer", "wallet", "cod"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const product = await getProductById(input.productId);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสินค้า" });
      if (product.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "สินค้าไม่พร้อมขาย" });
      if (product.sellerId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่สามารถซื้อสินค้าของตัวเองได้" });
      // ตรวจสต๊อกคงเหลือ
      const currentQty = (product as any).quantity ?? 1;
      if (currentQty <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "สินค้าหมดแล้ว" });

      // Validate payment method allowed by seller
      if (input.paymentMethod === "cod" && !(product as any).allowCod) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ผู้ขายไม่รับเก็บเงินปลายทาง" });
      }
      if (input.paymentMethod === "wallet" && !(product as any).allowWallet) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ผู้ขายไม่รับชำระผ่าน Wallet" });
      }

      const amount = parseFloat(product.price as string);
      const shippingFee = parseFloat((product as any).shippingFee as string) || 0;
      // COD fee: 3% ของราคาสินค้า (คำนวณฝั่ง server เสมอ)
      const COD_FEE_RATE = 0.03;
      const codFee = input.paymentMethod === "cod" ? Math.ceil(amount * COD_FEE_RATE) : 0;
      const seller = await getUserById(product.sellerId);

      // Wallet payment: deduct balance immediately
      if (input.paymentMethod === "wallet") {
        const wallet = await getWalletByUserId(ctx.user.id);
        if (!wallet) throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่พบ Wallet กรุณาเติมเงินก่อน" });
        const balance = parseFloat(wallet.balance as string);
        const total = amount + shippingFee;
        if (balance < total) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `ยอดเงินใน Wallet ไม่เพียงพอ (ต้องการ ฿${total.toLocaleString()} มี ฿${balance.toLocaleString()})`,
          });
        }
        await addWalletTransaction({
          walletId: wallet.id,
          userId: ctx.user.id,
          type: "purchase",
          amount: total,
          referenceType: "order",
          note: `ชำระค่าสินค้า: ${product.title}`,
        });
      }

      // ไม่ตัดสต๊อกตอนสร้าง order — จะตัดเมื่ออัปสลิปผ่านการตรวจสอบแล้วเท่านั้น
      const orderId = await createOrder({
        buyerId: ctx.user.id,
        sellerId: product.sellerId,
        productId: product.id,
        productTitle: product.title,
        productImage: (product.images as string[])?.[0],
        amount,
        shippingFee,
        codFee,
        shippingAddress: input.shippingAddress,
        paymentMethod: input.paymentMethod,
        // ใช้ payment info จาก product fields ก่อน แล้ว fallback ไป seller profile (รวม defaultPromptpayQrUrl)
        sellerPromptpay: (product as any).promptpayNumber ?? seller?.promptpayNumber ?? undefined,
        sellerBankName: (product as any).bankName ?? seller?.bankName ?? undefined,
        sellerBankAccountName: (product as any).bankAccountName ?? seller?.bankAccountName ?? undefined,
        sellerBankAccountNumber: (product as any).bankAccountNumber ?? seller?.bankAccountNumber ?? undefined,
        sellerPromptpayQrUrl: (product as any).promptpayQrUrl ?? (seller as any)?.defaultPromptpayQrUrl ?? undefined,
      });

      // Notify seller of new order (especially COD)
      if (input.paymentMethod === "cod") {
        try {
          const { pushNewCodOrder } = await import("../webPush");
          await pushNewCodOrder(product.sellerId, product.title, ctx.user.name || "ผู้ซื้อ");
        } catch (e) { /* ignore */ }
      }

      return { orderId, paymentMethod: input.paymentMethod };
    }),

  // Get order by ID (with slips + buyer + seller info)
  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const order = await getOrderById(input.id);
    if (!order) throw new TRPCError({ code: "NOT_FOUND" });
    if (order.buyerId !== ctx.user.id && order.sellerId !== ctx.user.id && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const slips = await getSlipsByOrder(input.id);
    const buyer = await getUserById(order.buyerId);
    const seller = await getUserById(order.sellerId);

    return { ...order, slips, buyer, seller };
  }),

  // List orders for buyer
  myPurchases: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
      offset: z.number().default(0),
      status: z.enum(["all", "pending_payment", "waiting_buyer_confirm", "payment_submitted", "payment_confirmed", "shipped", "completed", "cancelled"]).default("all"),
    }))
    .query(async ({ ctx, input }) => {
      const allOrders = await getOrdersByBuyer(ctx.user.id, 200, 0);
      const filtered = input.status === "all" ? allOrders : allOrders.filter((o) => o.status === input.status);
      const paginated = filtered.slice(input.offset, input.offset + input.limit);
      const enriched = await Promise.all(
        paginated.map(async (order) => {
          const seller = await getUserById(order.sellerId);
          return {
            ...order,
            seller: seller ? { id: seller.id, name: seller.name, avatar: seller.avatar } : null,
          };
        })
      );
      return {
        items: enriched,
        total: filtered.length,
        counts: {
          all: allOrders.length,
          pending_payment: allOrders.filter((o) => o.status === "pending_payment").length,
          waiting_buyer_confirm: allOrders.filter((o) => o.status === "waiting_buyer_confirm").length,
          payment_submitted: allOrders.filter((o) => o.status === "payment_submitted").length,
          payment_confirmed: allOrders.filter((o) => o.status === "payment_confirmed").length,
          shipped: allOrders.filter((o) => o.status === "shipped").length,
          completed: allOrders.filter((o) => o.status === "completed").length,
          cancelled: allOrders.filter((o) => o.status === "cancelled").length,
        },
      };
    }),

  // List orders for seller (with buyer info + slips)
  mySales: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
      offset: z.number().default(0),
      status: z.enum(["all", "pending_payment", "waiting_buyer_confirm", "seller_confirmed", "payment_submitted", "payment_confirmed", "shipped", "completed", "cancelled"]).default("all"),
    }))
    .query(async ({ ctx, input }) => {
      const allOrders = await getOrdersBySeller(ctx.user.id, 200, 0);
      const filtered = input.status === "all"
        ? allOrders
        : allOrders.filter((o) => o.status === input.status);

      // Enrich with buyer info + latest slip
      const enriched = await Promise.all(
        filtered.slice(input.offset, input.offset + input.limit).map(async (order) => {
          const buyer = await getUserById(order.buyerId);
          const slips = await getSlipsByOrder(order.id);
          const latestSlip = slips.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];
          return {
            ...order,
            buyer: buyer ? { id: buyer.id, name: buyer.name, avatar: buyer.avatar, phone: buyer.phone } : null,
            latestSlip: latestSlip ?? null,
          };
        })
      );

      return {
        items: enriched,
        total: filtered.length,
        counts: {
          all: allOrders.length,
          pending_payment: allOrders.filter((o) => o.status === "pending_payment").length,
          waiting_buyer_confirm: allOrders.filter((o) => o.status === "waiting_buyer_confirm").length,
          seller_confirmed: allOrders.filter((o) => o.status === "seller_confirmed").length,
          payment_submitted: allOrders.filter((o) => o.status === "payment_submitted").length,
          payment_confirmed: allOrders.filter((o) => o.status === "payment_confirmed").length,
          shipped: allOrders.filter((o) => o.status === "shipped").length,
          completed: allOrders.filter((o) => o.status === "completed").length,
          cancelled: allOrders.filter((o) => o.status === "cancelled").length,
        },
      };
    }),

  // Upload payment slip (buyer uploads proof of payment to seller)
  uploadSlip: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        slipBase64: z.string(),
        slipFilename: z.string(),
        slipContentType: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (order.status !== "pending_payment") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ออเดอร์นี้ไม่รอการชำระเงิน" });
      }

      const buffer = Buffer.from(input.slipBase64, "base64");
      assertImageUploadSize(buffer, "สลิป");
      const key = `payment-slips/${ctx.user.id}/${Date.now()}-${input.slipFilename}`;
      const { url } = await storagePut(key, buffer, input.slipContentType);

      await createPaymentSlip({
        orderId: input.orderId,
        uploadedBy: ctx.user.id,
        slipUrl: url,
        slipKey: key,
      });

      await updateOrderStatus(input.orderId, "payment_submitted");

      // ─── Vision AI ตรวจสอบสลิปอัตโนมัติ ─────────────────────────────────
      let verifyResult = null;
      try {
        const verifyInfo = {
          totalAmount: parseFloat(String(order.totalAmount ?? order.amount)),
          sellerBankAccountName: order.sellerBankAccountName ?? null,
          sellerBankAccountNumber: order.sellerBankAccountNumber ?? null,
          sellerBankName: order.sellerBankName ?? null,
          sellerPromptpay: order.sellerPromptpay ?? null,
          createdAt: order.createdAt,
        };
        verifyResult = await verifySlip(url, verifyInfo);

        if (verifyResult.autoApproved) {
          // อนุมัติอัตโนมัติ
          const slips = await getSlipsByOrder(input.orderId);
          const latestSlip = slips[slips.length - 1];
          if (latestSlip) {
            await updateSlipStatus(latestSlip.id, "approved", 0, `AI ตรวจสอบผ่านอัตโนมัติ (${verifyResult.confidence}%): ${verifyResult.note}`);
          }
          await updateOrderStatus(input.orderId, "payment_confirmed");
          // ตัดสต๊อกสินค้าเมื่อสลิปผ่านการตรวจสอบแล้ว
          const productForSlip = await getProductById(order.productId);
          if (productForSlip) {
            const currentQtySlip = (productForSlip as any).quantity ?? 1;
            const newQtySlip = Math.max(0, currentQtySlip - 1);
            await updateProduct(order.productId, {
              quantity: newQtySlip,
              ...(newQtySlip === 0 ? { status: "sold" } : {}),
            });
          }
        }
      } catch (verifyErr) {
        console.warn("[SlipVerifier] Auto-verify failed, manual review required:", verifyErr);
      }

      const autoApproved = verifyResult?.autoApproved ?? false;
      const confidence = verifyResult?.confidence ?? 0;
      return {
        success: true,
        autoApproved,
        confidence,
        message: autoApproved
          ? `ตรวจสอบสลิปผ่านอัตโนมัติ ✓ (ความมั่นใจ ${confidence}%) ออเดอร์ได้รับการยืนยันแล้ว`
          : `อัปโหลดสลิปแล้ว ${verifyResult ? `(ความมั่นใจ ${confidence}%)` : ""} รอผู้ขายยืนยัน`,
        verifyNote: verifyResult?.note ?? null,
        failReasons: verifyResult?.failReasons ?? [],
      };
    }),

  // Seller: confirm payment received (seller confirms they received money)
  sellerConfirmPayment: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (order.status !== "payment_submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ยังไม่มีสลิปการชำระเงิน" });
      }

      // Approve the latest slip
      const slips = await getSlipsByOrder(input.orderId);
      const pendingSlip = slips.find((s) => s.status === "pending");
      if (pendingSlip) {
        await updateSlipStatus(pendingSlip.id, "approved", ctx.user.id, "ผู้ขายยืนยันรับเงินแล้ว");
      }

      await updateOrderStatus(input.orderId, "payment_confirmed");
      // ตัดสต๊อกสินค้าเมื่อผู้ขายยืนยันรับเงินเอง
      const productToDeduct = await getProductById(order.productId);
      if (productToDeduct) {
        const currentQtyDeduct = (productToDeduct as any).quantity ?? 1;
        const newQtyDeduct = Math.max(0, currentQtyDeduct - 1);
        await updateProduct(order.productId, {
          quantity: newQtyDeduct,
          ...(newQtyDeduct === 0 ? { status: "sold" } : {}),
        });
      }
      return { success: true };
    }),

  // Seller: reject payment (slip looks wrong — ask buyer to re-upload)
  sellerRejectPayment: protectedProcedure
    .input(z.object({ orderId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (order.status !== "payment_submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่มีสลิปที่รอตรวจสอบ" });
      }

      const slips = await getSlipsByOrder(input.orderId);
      const pendingSlip = slips.find((s) => s.status === "pending");
      if (pendingSlip) {
        await updateSlipStatus(pendingSlip.id, "rejected", ctx.user.id, input.reason ?? "ผู้ขายปฏิเสธสลิป");
      }

      // Revert to pending_payment so buyer can re-upload
      await updateOrderStatus(input.orderId, "pending_payment");
      return { success: true };
    }),

  // Seller: mark as shipped
  markShipped: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      trackingNumber: z.string().optional(),
      shippingProvider: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      // COD flow: pending_payment → waiting_buyer_confirm → seller_confirmed → shipped
      // Non-COD flow: payment_confirmed → shipped
      const isCodOrder = order.paymentMethod === "cod";
      if (isCodOrder) {
        // COD orders must be seller_confirmed (buyer accepted agreement) before shipping
        if (order.status !== "seller_confirmed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ผู้ซื้อยังไม่ได้ยอมรับเงื่อนไข COD ไม่สามารถจัดส่งได้" });
        }
      } else {
        // Non-COD orders must be payment_confirmed before shipping
        if (order.status !== "payment_confirmed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่สามารถบันทึกการจัดส่งได้ในสถานะนี้" });
        }
      }
      await updateOrderStatus(input.orderId, "shipped", {
        trackingNumber: input.trackingNumber,
        shippingProvider: input.shippingProvider,
        shippedAt: new Date(),
      });
      // ตัดสต๊อกสินค้าเมื่อจัดส่ง (COD: ตัดตอนนี้ เพราะยังไม่ได้ตัดตอน payment_confirmed)
      if (isCodOrder && order.status === "seller_confirmed") {
        const productToDeduct = await getProductById(order.productId);
        if (productToDeduct) {
          const currentQty = (productToDeduct as any).quantity ?? 1;
          const newQty = Math.max(0, currentQty - 1);
          await updateProduct(order.productId, {
            quantity: newQty,
            ...(newQty === 0 ? { status: "sold" } : {}),
          });
        }
      }
      // แจ้งผู้ซื้อว่าจัดส่งแล้ว
      notifyOrderStatusChange(order.buyerId, input.orderId, "shipped", order.productTitle).catch(() => {});
      return { success: true };
    }),
    // Seller: cancel order
  cancelOrder: protectedProcedure
    .input(z.object({ orderId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.sellerId !== ctx.user.id && order.buyerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const cancellableStatuses: string[] = ["pending_payment", "payment_submitted"];
      if (!cancellableStatuses.includes(order.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่สามารถยกเลิกออเดอร์นี้ได้" });
      }
      // คืนสถานะสินค้าเป็น active เมื่อยกเลิก order (ไม่ต้องคืนสต๊อกเพราะยังไม่ได้ตัด)
      const product = await getProductById(order.productId);
      if (product) {
        const nonRestorableStatuses = ["deleted", "rejected", "pending_fee", "pending_approval", "draft", "expired", "sold"];
        // คืนเป็น active เฉพาะถ้าสินค้ายังไม่ได้ขายจริง (ไม่ใช่ sold)
        if (!nonRestorableStatuses.includes(product.status)) {
          await updateProduct(order.productId, { status: "active" });
        }
      }
      await updateOrderStatus(input.orderId, "cancelled", {
        note: input.reason ? `ยกเลิกโดย: ${input.reason}` : undefined,
      });
      return { success: true };
    }),

  // Buyer: confirm received
  confirmReceived: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (order.status !== "shipped") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ยังไม่ได้จัดส่ง" });
      }

            await updateOrderStatus(input.orderId, "completed");
      await updateProduct(order.productId, { status: "sold" });
      // แจ้งผู้ขายว่าออเดอร์เสร็จสมบูรณ์
      notifyOrderStatusChange(order.sellerId, input.orderId, "completed", order.productTitle).catch(() => {});
      return { success: true };
    }),
  // Admin: list pending slips
  adminPendingSlips: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const slips = await getPendingSlips();
    const slipsWithOrders = await Promise.all(
      slips.map(async (slip) => {
        const order = await getOrderById(slip.orderId);
        const buyer = order ? await getUserById(order.buyerId) : null;
        return { ...slip, order, buyer };
      })
    );
    return slipsWithOrders;
  }),

  // Admin: all orders
  adminList: protectedProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return getAllOrders(input.limit, input.offset);
    }),

  // Seller: confirm COD order (ยืนยันรับออเดอร์ COD + ลบสินค้าออก feed + ส่งข้อความแชต)
  confirmOrder: protectedProcedure
    .input(z.object({
      orderId: z.number().int().positive(),
      estimatedShipDate: z.string().optional(), // ISO date string e.g. "2026-07-18"
    }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (order.paymentMethod !== "cod") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ใช้ได้เฉพาะออเดอร์ COD เท่านั้น" });
      }
      // COD orders can be confirmed from pending_payment or payment_confirmed (legacy/auto-approved)
      if (order.status !== "pending_payment" && order.status !== "payment_confirmed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ออเดอร์นี้ยืนยันไปแล้วหรืออยู่ในสถานะที่ไม่สามารถยืนยันได้" });
      }
      // 1. เปลี่ยน order status → waiting_buyer_confirm (รอผู้ซื้อยอมรับเงื่อนไข COD)
      await updateOrderStatus(input.orderId, "waiting_buyer_confirm");
      // 2. เปลี่ยน product status → sold (ลบออกจาก feed ทันที)
      const product = await getProductById(order.productId);
      if (product) {
        await updateProduct(order.productId, { status: "sold", soldAt: new Date() } as any);
      }
      // 3. ส่งข้อความแชตอัตโนมัติไปหาผู้ซื้อ
      const db = await getDb();
      if (db) {
        const [conv] = await db
          .select()
          .from(conversations)
          .where(and(
            eq(conversations.buyerId, order.buyerId),
            eq(conversations.sellerId, order.sellerId),
            eq(conversations.productId, order.productId)
          ))
          .limit(1);
        let convId: number = conv?.id ?? 0;
        if (!conv) {
          const result = await db.insert(conversations).values({
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            productId: order.productId,
          });
          convId = (result as any)[0]?.insertId ?? 0;
        }
        if (convId) {
          const shipDate = input.estimatedShipDate ? new Date(input.estimatedShipDate) : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const shipDateOnly = new Date(shipDate);
          shipDateOnly.setHours(0, 0, 0, 0);
          let dateLabel: string;
          if (shipDateOnly.getTime() === today.getTime()) {
            dateLabel = "วันนี้";
          } else if (shipDateOnly.getTime() === tomorrow.getTime()) {
            dateLabel = "พรุ่งนี้";
          } else {
            dateLabel = shipDate.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" });
          }
          const autoMsg = `✅ ผู้ขายยืนยันรับออเดอร์แล้ว\n\n📦 สินค้า: ${order.productTitle}\n💰 ยอดชำระ COD: ฿${parseFloat(String(order.totalAmount)).toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n🚚 จะจัดส่งให้ภายใน: ${dateLabel}\n\n⚠️ กรุณากดยอมรับเงื่อนไข COD ในหน้า "คำสั่งซื้อของฉัน" เพื่อให้ผู้ขายจัดส่งสินค้าให้คุณได้ครับ 🙏`;
          await db.insert(messages).values({
            conversationId: convId,
            senderId: order.sellerId,
            content: autoMsg,
          });
          await db.update(conversations).set({
            lastMessageAt: new Date(),
            buyerUnread: (conv?.buyerUnread ?? 0) + 1,
          }).where(eq(conversations.id, convId));
        }
      }
      // 4. Push notification ไปยังผู้ซื้อ
      notifyOrderStatusChange(order.buyerId, input.orderId, "waiting_buyer_confirm" as any, order.productTitle).catch(() => {});
      return { success: true };
    }),

  // Buyer accepts COD agreement — changes status from waiting_buyer_confirm → seller_confirmed
  buyerAcceptCodAgreement: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (order.paymentMethod !== "cod") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ใช้ได้เฉพาะออเดอร์ COD เท่านั้น" });
      }
      if (order.status !== "waiting_buyer_confirm") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ออเดอร์นี้ไม่อยู่ในสถานะรอยอมรับเงื่อนไข" });
      }
      // Update status to seller_confirmed (ready to ship)
      await updateOrderStatus(input.orderId, "seller_confirmed", {
        codAgreementAcceptedAt: new Date(),
      });
      // Notify seller that buyer accepted
      notifyOrderStatusChange(order.sellerId, input.orderId, "seller_confirmed" as any, order.productTitle).catch(() => {});
      // Send auto chat message to seller
      const db = await getDb();
      if (db) {
        const [conv] = await db
          .select()
          .from(conversations)
          .where(and(
            eq(conversations.buyerId, order.buyerId),
            eq(conversations.sellerId, order.sellerId),
            eq(conversations.productId, order.productId)
          ))
          .limit(1);
        if (conv) {
          await db.insert(messages).values({
            conversationId: conv.id,
            senderId: order.buyerId,
            content: `✅ ฉันยอมรับเงื่อนไข COD แล้ว กรุณาจัดส่งสินค้าให้ด้วยครับ 🙏`,
          });
          await db.update(conversations).set({
            lastMessageAt: new Date(),
            sellerUnread: (conv.sellerUnread ?? 0) + 1,
          }).where(eq(conversations.id, conv.id));
        }
      }
      return { success: true };
    }),

  // Get COD agreement text
  getCodAgreement: protectedProcedure
    .query(async () => {
      return {
        title: "เงื่อนไขการสั่งซื้อแบบเก็บเงินปลายทาง (COD)",
        sections: [
          {
            heading: "ข้อ 1: การยืนยันรับสินค้า",
            content: "เมื่อท่านกดยอมรับเงื่อนไขนี้ ถือว่าท่านตกลงที่จะรับสินค้าและชำระเงินให้พนักงานขนส่ง ณ จุดหมายที่ท่านระบุไว้",
          },
          {
            heading: "ข้อ 2: บทลงโทษกรณีไม่รับสินค้า",
            content: "หากท่านสั่งซื้อสินค้าแล้วไม่รับสินค้า (ปฏิเสธรับสินค้า) โดยไม่มีเหตุอันสมควร ระบบจะดำเนินการดังนี้:\n\nครั้งที่ 1: แจ้งเตือน + บัญชีถูกพัก 7 วัน\nครั้งที่ 2: บัญชีถูกพัก 30 วัน + ไม่สามารถสั่งซื้อแบบ COD ได้อีก\nครั้งที่ 3: บัญชีถูกระงับถาวร",
          },
          {
            heading: "ข้อ 3: ค่าเสียหายที่ผู้ขายต้องรับผิดชอบ",
            content: "ผู้ขายต้องรับภาระค่าขนส่งทั้งไปและกลับที่เกิดขึ้นจากการที่ผู้ซื้อไม่รับสินค้า โดยระบบจะเรียกเก็บค่าเสียหายจากผู้ซื้อโดยอัตโนมัติ",
          },
          {
            heading: "ข้อ 4: สิทธิ์ของผู้ขาย",
            content: "หากผู้ซื้อไม่รับสินค้าโดยไม่แจ้งเหตุผลล่วงหน้า ผู้ขายสามารถร้องเรียนผ่านระบบและแจ้งเจ้าหน้าที่ได้ โดยระบบจะเก็บหลักฐานไว้เพื่อดำเนินการตามกฎหมาย",
          },
        ],
        footer: "การกดยอมรับถือว่าท่านได้อ่านและเข้าใจเงื่อนไขทั้งหมดแล้ว และยินยอมปฏิบัติตาม",
      };
    }),

  // Get tracking info for an order (buyer or seller)
  getTrackingInfo: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.buyerId !== ctx.user.id && order.sellerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const TRACKING_URLS: Record<string, (t: string) => string> = {
        kerry: (t) => `https://th.kerryexpress.com/th/track/?track=${t}`,
        flash: (t) => `https://www.flashexpress.co.th/tracking/?se=${t}`,
        jnt: (t) => `https://www.jtexpress.co.th/index/query/gzquery.html?bills=${t}`,
        thailand_post: (t) => `https://track.thailandpost.co.th/?trackNumber=${t}`,
        dhl: (t) => `https://www.dhl.com/th-th/home/tracking.html?tracking-id=${t}`,
        other: (t) => `https://www.17track.net/th/track#nums=${t}`,
      };
      const PROVIDER_LABELS: Record<string, string> = {
        kerry: "Kerry Express",
        flash: "Flash Express",
        jnt: "J&T Express",
        thailand_post: "ไปรษณีย์ไทย",
        dhl: "DHL",
        other: "อื่นๆ",
      };
      const trackingUrl = order.trackingNumber
        ? (order.shippingProvider && TRACKING_URLS[order.shippingProvider]
            ? TRACKING_URLS[order.shippingProvider](order.trackingNumber)
            : TRACKING_URLS.other(order.trackingNumber))
        : null;
      return {
        orderId: order.id,
        status: order.status,
        trackingNumber: order.trackingNumber ?? null,
        shippingProvider: order.shippingProvider ?? null,
        providerLabel: order.shippingProvider ? (PROVIDER_LABELS[order.shippingProvider] ?? order.shippingProvider) : null,
        trackingUrl,
        shippedAt: order.shippedAt ?? null,
        shippingAddress: order.shippingAddress ?? null,
        productTitle: order.productTitle,
        productImage: order.productImage ?? null,
      };
    }),

  // Delete order (only cancelled/completed/refunded, by buyer or seller or admin)
  deleteOrder: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.id);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบออเดอร์" });
      const isBuyer = order.buyerId === ctx.user.id;
      const isSeller = order.sellerId === ctx.user.id;
      if (!isBuyer && !isSeller && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "คุณไม่มีสิทธิ์ลบออเดอร์นี้" });
      }
      const deletableStatuses = ["cancelled", "completed", "refunded"];
      if (!deletableStatuses.includes(order.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ลบได้เฉพาะออเดอร์ที่ยกเลิก หรือสำเร็จแล้วเท่านั้น" });
      }
      await deleteOrderById(input.id);
      return { success: true };
    }),
});
