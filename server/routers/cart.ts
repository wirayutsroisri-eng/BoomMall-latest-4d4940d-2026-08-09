import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cartItems, products, users } from "../../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const cartRouter = router({
  // ดึงรายการในตะกร้าพร้อมข้อมูลสินค้า
  getCart: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { items: [], total: 0, itemCount: 0 };

    const items = await db
      .select()
      .from(cartItems)
      .where(eq(cartItems.userId, ctx.user.id));

    if (items.length === 0) return { items: [], total: 0, itemCount: 0 };

    const productIds = items.map((i) => i.productId);
    const productList = await db
      .select({
        id: products.id,
        title: products.title,
        price: products.price,
        images: products.images,
        status: products.status,
        quantity: products.quantity,
        sellerId: products.sellerId,
        location: products.location,
        condition: products.condition,
      })
      .from(products)
      .where(inArray(products.id, productIds));

    const sellerIdSet = new Set<number>();
    for (const p of productList) sellerIdSet.add(p.sellerId);
    const sellerIds = Array.from(sellerIdSet);

    const sellerList = await db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        lineId: users.lineId,
        promptpayNumber: users.promptpayNumber,
        kycStatus: users.kycStatus,
      })
      .from(users)
      .where(inArray(users.id, sellerIds));

    const sellerMap: Record<number, typeof sellerList[0]> = {};
    for (const s of sellerList) sellerMap[s.id] = s;

    const productMap: Record<number, typeof productList[0]> = {};
    for (const p of productList) productMap[p.id] = p;

    const enrichedItems = items.map((item) => {
      const product = productMap[item.productId] ?? null;
      const seller = product ? (sellerMap[product.sellerId] ?? null) : null;
      return {
        ...item,
        product: product
          ? {
              ...product,
              price: String(product.price),
              images: (product.images ?? []) as string[],
              seller,
              isAvailable: product.status === "active",
            }
          : null,
      };
    });

    let total = 0;
    let itemCount = 0;
    for (const item of enrichedItems) {
      itemCount += item.quantity;
      if (item.product?.isAvailable) {
        total += parseFloat(item.product.price) * item.quantity;
      }
    }

    return { items: enrichedItems, total, itemCount };
  }),

  // เพิ่มสินค้าเข้าตะกร้า
  addItem: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(99).default(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสินค้า" });
      if (product.status !== "active")
        throw new TRPCError({ code: "BAD_REQUEST", message: "สินค้านี้ไม่พร้อมขาย" });
      if (product.sellerId === ctx.user.id)
        throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่สามารถเพิ่มสินค้าของตัวเองลงตะกร้าได้" });

      const [existing] = await db
        .select()
        .from(cartItems)
        .where(and(eq(cartItems.userId, ctx.user.id), eq(cartItems.productId, input.productId)))
        .limit(1);

      if (existing) {
        const newQty = Math.min(existing.quantity + input.quantity, product.quantity);
        await db
          .update(cartItems)
          .set({ quantity: newQty })
          .where(eq(cartItems.id, existing.id));
        return { success: true, action: "updated" as const };
      }

      await db.insert(cartItems).values({
        userId: ctx.user.id,
        productId: input.productId,
        quantity: Math.min(input.quantity, product.quantity),
      });

      return { success: true, action: "added" as const };
    }),

  // อัปเดตจำนวนสินค้าในตะกร้า
  updateItem: protectedProcedure
    .input(
      z.object({
        cartItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [item] = await db
        .select()
        .from(cartItems)
        .where(and(eq(cartItems.id, input.cartItemId), eq(cartItems.userId, ctx.user.id)))
        .limit(1);

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบรายการในตะกร้า" });

      await db
        .update(cartItems)
        .set({ quantity: input.quantity })
        .where(eq(cartItems.id, input.cartItemId));

      return { success: true };
    }),

  // ลบสินค้าออกจากตะกร้า
  removeItem: protectedProcedure
    .input(z.object({ cartItemId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db
        .delete(cartItems)
        .where(and(eq(cartItems.id, input.cartItemId), eq(cartItems.userId, ctx.user.id)));
      return { success: true };
    }),

  // ล้างตะกร้าทั้งหมด
  clearCart: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    await db.delete(cartItems).where(eq(cartItems.userId, ctx.user.id));
    return { success: true };
  }),
});
