import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getUserById } from "../db";
import { conversations, messages, products, users } from "../../drizzle/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { notifyNewMessage } from "../_core/pushNotification";
import type { ChatMode } from "../../shared/types";

function supportsChatMode(listingType: string, chatMode: ChatMode): boolean {
  if (listingType === "both") return true;
  return listingType === chatMode;
}

function formatShippingAddress(user: {
  shippingName?: string | null;
  shippingPhone?: string | null;
  shippingAddress?: string | null;
  shippingSubdistrict?: string | null;
  shippingDistrict?: string | null;
  shippingProvince?: string | null;
  shippingZipCode?: string | null;
}): string {
  const lines = [
    "📦 ที่อยู่จัดส่ง",
    user.shippingName ? `ชื่อ: ${user.shippingName}` : null,
    user.shippingPhone ? `โทร: ${user.shippingPhone}` : null,
    user.shippingAddress ? `ที่อยู่: ${user.shippingAddress}` : null,
    user.shippingSubdistrict || user.shippingDistrict
      ? `ต./แขวง ${user.shippingSubdistrict ?? ""} อ./เขต ${user.shippingDistrict ?? ""}`.trim()
      : null,
    user.shippingProvince || user.shippingZipCode
      ? `จ. ${user.shippingProvince ?? ""} ${user.shippingZipCode ?? ""}`.trim()
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatPaymentInfo(user: {
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  promptpayNumber?: string | null;
}): string {
  const lines = [
    "💳 ข้อมูลชำระเงิน (โอนนอกแอป)",
    user.bankName ? `ธนาคาร: ${user.bankName}` : null,
    user.bankAccountNumber ? `เลขบัญชี: ${user.bankAccountNumber}` : null,
    user.bankAccountName ? `ชื่อบัญชี: ${user.bankAccountName}` : null,
    user.promptpayNumber ? `พร้อมเพย์: ${user.promptpayNumber}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

async function insertMessageAndNotify(opts: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  conv: typeof conversations.$inferSelect;
  senderId: number;
  content: string;
  messageType: "text" | "shipping_address" | "payment_info";
}) {
  const { db, conv, senderId, content, messageType } = opts;
  const isBuyer = conv.buyerId === senderId;

  await db.insert(messages).values({
    conversationId: conv.id,
    senderId,
    content,
    messageType,
  });

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      ...(isBuyer ? { sellerUnread: sql`sellerUnread + 1` } : { buyerUnread: sql`buyerUnread + 1` }),
    })
    .where(eq(conversations.id, conv.id));

  const recipientId = isBuyer ? conv.sellerId : conv.buyerId;
  const [product] = await db
    .select({ title: products.title })
    .from(products)
    .where(eq(products.id, conv.productId))
    .limit(1);
  const [sender] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, senderId))
    .limit(1);

  if (product && sender) {
    await notifyNewMessage(recipientId, sender.name || "ผู้ใช้", product.title);
  }
}

export const chatRouter = router({
  startConversation: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        chatMode: z.enum(["c2c", "b2b"]).default("c2c"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [product] = await db
        .select({
          id: products.id,
          sellerId: products.sellerId,
          title: products.title,
          listingType: products.listingType,
        })
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสินค้า" });
      if (product.sellerId === ctx.user.id)
        throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่สามารถแชทกับตัวเองได้" });

      if (!supportsChatMode(product.listingType, input.chatMode)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: input.chatMode === "b2b"
            ? "สินค้านี้ไม่รองรับการสอบถามราคาส่ง B2B"
            : "สินค้านี้ไม่รองรับการซื้อมือสอง C2C",
        });
      }

      const [existing] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.buyerId, ctx.user.id),
            eq(conversations.sellerId, product.sellerId),
            eq(conversations.productId, input.productId),
            eq(conversations.chatMode, input.chatMode)
          )
        )
        .limit(1);

      if (existing) return { conversationId: existing.id, isNew: false };

      const result = await db.insert(conversations).values({
        buyerId: ctx.user.id,
        sellerId: product.sellerId,
        productId: input.productId,
        chatMode: input.chatMode,
      });

      return { conversationId: Number(result[0].insertId), isNew: true };
    }),

  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const convList = await db
      .select()
      .from(conversations)
      .where(
        or(
          eq(conversations.buyerId, ctx.user.id),
          eq(conversations.sellerId, ctx.user.id)
        )
      )
      .orderBy(desc(conversations.lastMessageAt));

    if (convList.length === 0) return [];

    const productIdSet = new Set<number>();
    for (const c of convList) productIdSet.add(c.productId);
    const productIds = Array.from(productIdSet);
    const userIdSet = new Set<number>();
    for (const c of convList) {
      userIdSet.add(c.buyerId);
      userIdSet.add(c.sellerId);
    }
    const userIds = Array.from(userIdSet);

    const productList = await db
      .select({ id: products.id, title: products.title, images: products.images, listingType: products.listingType })
      .from(products)
      .where(sql`${products.id} IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})`);

    const userList = await db
      .select({ id: users.id, name: users.name, avatar: users.avatar })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(Array.from(userIds).map((id) => sql`${id}`), sql`, `)})`);

    const productMap: Record<number, typeof productList[0]> = {};
    for (const p of productList) productMap[p.id] = p;

    const userMap: Record<number, typeof userList[0]> = {};
    for (const u of userList) userMap[u.id] = u;

    const lastMessages = await db
      .select()
      .from(messages)
      .where(sql`${messages.conversationId} IN (${sql.join(convList.map((c) => sql`${c.id}`), sql`, `)})`)
      .orderBy(desc(messages.createdAt));

    const lastMsgMap: Record<number, typeof lastMessages[0]> = {};
    for (const m of lastMessages) {
      if (!lastMsgMap[m.conversationId]) lastMsgMap[m.conversationId] = m;
    }

    return convList.map((conv) => {
      const isBuyer = conv.buyerId === ctx.user.id;
      const otherUserId = isBuyer ? conv.sellerId : conv.buyerId;
      const unread = isBuyer ? conv.buyerUnread : conv.sellerUnread;
      return {
        ...conv,
        product: productMap[conv.productId] ?? null,
        otherUser: userMap[otherUserId] ?? null,
        lastMessage: lastMsgMap[conv.id] ?? null,
        unread,
        isBuyer,
      };
    });
  }),

  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { messages: [], conversation: null };

      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);

      if (!conv) throw new TRPCError({ code: "NOT_FOUND" });
      if (conv.buyerId !== ctx.user.id && conv.sellerId !== ctx.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });

      const isBuyer = conv.buyerId === ctx.user.id;
      await db
        .update(conversations)
        .set(isBuyer ? { buyerUnread: 0 } : { sellerUnread: 0 })
        .where(eq(conversations.id, input.conversationId));

      const msgList = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(messages.createdAt);

      const [product] = await db
        .select({
          id: products.id,
          title: products.title,
          images: products.images,
          price: products.price,
          status: products.status,
          listingType: products.listingType,
        })
        .from(products)
        .where(eq(products.id, conv.productId))
        .limit(1);

      const otherUserId = isBuyer ? conv.sellerId : conv.buyerId;
      const [otherUser] = await db
        .select({ id: users.id, name: users.name, avatar: users.avatar, phone: users.phone, lineId: users.lineId })
        .from(users)
        .where(eq(users.id, otherUserId))
        .limit(1);

      return {
        messages: msgList,
        conversation: { ...conv, product: product ?? null, otherUser: otherUser ?? null, isBuyer },
      };
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        content: z.string().min(1).max(2000),
        messageType: z.enum(["text", "shipping_address", "payment_info"]).default("text"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);

      if (!conv) throw new TRPCError({ code: "NOT_FOUND" });
      if (conv.buyerId !== ctx.user.id && conv.sellerId !== ctx.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });

      await insertMessageAndNotify({
        db,
        conv,
        senderId: ctx.user.id,
        content: input.content,
        messageType: input.messageType,
      });

      return { success: true };
    }),

  sendShortcut: protectedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        shortcut: z.enum(["shipping_address", "payment_info"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);

      if (!conv) throw new TRPCError({ code: "NOT_FOUND" });
      if (conv.buyerId !== ctx.user.id && conv.sellerId !== ctx.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });

      const isBuyer = conv.buyerId === ctx.user.id;
      const isSeller = conv.sellerId === ctx.user.id;

      if (input.shortcut === "shipping_address") {
        if (!isBuyer) {
          throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ซื้อเท่านั้นที่ส่งที่อยู่ได้" });
        }
        const user = await getUserById(ctx.user.id);
        if (!user?.shippingName || !user.shippingAddress) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "กรุณาตั้งค่าที่อยู่จัดส่งในโปรไฟล์ก่อน",
          });
        }
        const content = formatShippingAddress(user);
        await insertMessageAndNotify({ db, conv, senderId: ctx.user.id, content, messageType: "shipping_address" });
      } else {
        if (!isSeller) {
          throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ขายเท่านั้นที่ส่งข้อมูลชำระเงินได้" });
        }
        const user = await getUserById(ctx.user.id);
        if (!user?.bankAccountNumber && !user?.promptpayNumber) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "กรุณาตั้งค่าเลขบัญชี/พร้อมเพย์ในโปรไฟล์ก่อน",
          });
        }
        const content = formatPaymentInfo(user);
        await insertMessageAndNotify({ db, conv, senderId: ctx.user.id, content, messageType: "payment_info" });
      }

      return { success: true };
    }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { count: 0 };

    const convList = await db
      .select({ buyerId: conversations.buyerId, buyerUnread: conversations.buyerUnread, sellerUnread: conversations.sellerUnread })
      .from(conversations)
      .where(or(eq(conversations.buyerId, ctx.user.id), eq(conversations.sellerId, ctx.user.id)));

    let count = 0;
    for (const c of convList) {
      count += c.buyerId === ctx.user.id ? c.buyerUnread : c.sellerUnread;
    }
    return { count };
  }),
});
