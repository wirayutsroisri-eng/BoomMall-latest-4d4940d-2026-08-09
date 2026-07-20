import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  getUserById,
  getProducts,
  countProducts,
  getSellerRating,
} from "../db";
import { orders, sellerFollows } from "../../drizzle/schema";
import { eq, and, count, sql } from "drizzle-orm";

export const sellerStoreRouter = router({
  // ── Get public seller profile + stats + products ─────────────────────────
  getProfile: publicProcedure
    .input(z.object({ sellerId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Seller info
      const seller = await getUserById(input.sellerId);
      if (!seller) throw new Error("ไม่พบผู้ขายนี้");

      // Active products count
      const totalProducts = await countProducts({
        sellerId: input.sellerId,
        status: "active",
      });

      // Rating
      const rating = await getSellerRating(input.sellerId);

      // Follower count
      const [{ followerCount }] = await db
        .select({ followerCount: count() })
        .from(sellerFollows)
        .where(eq(sellerFollows.sellerId, input.sellerId));

      // Sold count (completed orders)
      const [{ soldCount }] = await db
        .select({ soldCount: count() })
        .from(orders)
        .where(
          and(
            eq(orders.sellerId, input.sellerId),
            eq(orders.status, "completed")
          )
        );

      // Is following (if logged in)
      let isFollowing = false;
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
        isFollowing = existing.length > 0;
      }

      // All active products
      const allProducts = await getProducts({
        sellerId: input.sellerId,
        status: "active",
        limit: 50,
        offset: 0,
      });

      // Best sellers: products with most likes (viewCount as proxy for now)
      const bestSellers = [...allProducts]
        .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
        .slice(0, 8);

      return {
        seller: {
          id: seller.id,
          name: seller.name,
          avatar: seller.avatar,
          province: seller.province,
          createdAt: seller.createdAt,
          kycStatus: seller.kycStatus,
        },
        stats: {
          totalProducts: Number(totalProducts),
          rating: Number(rating.avg) || 0,
          reviewCount: Number(rating.count),
          followerCount: Number(followerCount),
          soldCount: Number(soldCount),
        },
        isFollowing,
        bestSellers,
        allProducts,
      };
    }),
});
