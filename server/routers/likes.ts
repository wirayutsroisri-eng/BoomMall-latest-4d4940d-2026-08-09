import { z } from "zod";
import { eq, and, count, desc } from "drizzle-orm";
import { getDb } from "../db";
import { productLikes, sellerFollows } from "../../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

export const likesRouter = router({
  // ── Toggle like on a product ─────────────────────────────────────────────
  toggleLike: protectedProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const existing = await db
        .select()
        .from(productLikes)
        .where(
          and(
            eq(productLikes.userId, ctx.user.id),
            eq(productLikes.productId, input.productId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .delete(productLikes)
          .where(
            and(
              eq(productLikes.userId, ctx.user.id),
              eq(productLikes.productId, input.productId)
            )
          );
        const [{ total }] = await db
          .select({ total: count() })
          .from(productLikes)
          .where(eq(productLikes.productId, input.productId));
        return { liked: false, likeCount: Number(total) };
      } else {
        await db.insert(productLikes).values({
          userId: ctx.user.id,
          productId: input.productId,
        });
        const [{ total }] = await db
          .select({ total: count() })
          .from(productLikes)
          .where(eq(productLikes.productId, input.productId));
        return { liked: true, likeCount: Number(total) };
      }
    }),

  // ── Get like status + count for a product ───────────────────────────────
  getLikeStatus: publicProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { liked: false, likeCount: 0 };

      const [{ total }] = await db
        .select({ total: count() })
        .from(productLikes)
        .where(eq(productLikes.productId, input.productId));

      let liked = false;
      if (ctx.user) {
        const existing = await db
          .select()
          .from(productLikes)
          .where(
            and(
              eq(productLikes.userId, ctx.user.id),
              eq(productLikes.productId, input.productId)
            )
          )
          .limit(1);
        liked = existing.length > 0;
      }

      return { liked, likeCount: Number(total) };
    }),

  // ── Get all products liked by current user ───────────────────────────────
  getLikedProducts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ productId: productLikes.productId })
      .from(productLikes)
      .where(eq(productLikes.userId, ctx.user.id))
      .orderBy(desc(productLikes.createdAt));
    return rows.map((r: { productId: number }) => r.productId);
  }),

  // ── Toggle follow a seller ───────────────────────────────────────────────
  toggleFollow: protectedProcedure
    .input(z.object({ sellerId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.id === input.sellerId) {
        throw new Error("ไม่สามารถติดตามตัวเองได้");
      }
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const existing = await db
        .select()
        .from(sellerFollows)
        .where(
          and(
            eq(sellerFollows.followerId, ctx.user.id),
            eq(sellerFollows.sellerId, input.sellerId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .delete(sellerFollows)
          .where(
            and(
              eq(sellerFollows.followerId, ctx.user.id),
              eq(sellerFollows.sellerId, input.sellerId)
            )
          );
        const [{ total }] = await db
          .select({ total: count() })
          .from(sellerFollows)
          .where(eq(sellerFollows.sellerId, input.sellerId));
        return { following: false, followerCount: Number(total) };
      } else {
        await db.insert(sellerFollows).values({
          followerId: ctx.user.id,
          sellerId: input.sellerId,
        });
        const [{ total }] = await db
          .select({ total: count() })
          .from(sellerFollows)
          .where(eq(sellerFollows.sellerId, input.sellerId));
        return { following: true, followerCount: Number(total) };
      }
    }),

  // ── Get follow status + follower count for a seller ──────────────────────
  getFollowStatus: publicProcedure
    .input(z.object({ sellerId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { following: false, followerCount: 0 };

      const [{ total }] = await db
        .select({ total: count() })
        .from(sellerFollows)
        .where(eq(sellerFollows.sellerId, input.sellerId));

      let following = false;
      if (ctx.user) {
        const existing = await db
          .select()
          .from(sellerFollows)
          .where(
            and(
              eq(sellerFollows.followerId, ctx.user.id),
              eq(sellerFollows.sellerId, input.sellerId)
            )
          )
          .limit(1);
        following = existing.length > 0;
      }

      return { following, followerCount: Number(total) };
    }),

  // ── Get sellers followed by current user ─────────────────────────────────
  getFollowedSellers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ sellerId: sellerFollows.sellerId })
      .from(sellerFollows)
      .where(eq(sellerFollows.followerId, ctx.user.id))
      .orderBy(desc(sellerFollows.createdAt));
    return rows.map((r: { sellerId: number }) => r.sellerId);
  }),
});
