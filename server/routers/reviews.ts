import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createReview,
  getOrderById,
  getReviewByOrder,
  getReviewsByProduct,
  getReviewsBySeller,
  getSellerRating,
  getUserById,
} from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

export const reviewsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        rating: z.number().min(1).max(5),
        comment: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (order.status !== "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ต้องรับสินค้าก่อนจึงจะรีวิวได้" });
      }

      const existing = await getReviewByOrder(input.orderId);
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "รีวิวแล้ว" });

      await createReview({
        orderId: input.orderId,
        reviewerId: ctx.user.id,
        sellerId: order.sellerId,
        productId: order.productId,
        rating: input.rating,
        comment: input.comment,
      });

      return { success: true };
    }),

  getByProduct: publicProcedure.input(z.object({ productId: z.number() })).query(async ({ input }) => {
    const reviews = await getReviewsByProduct(input.productId);
    const withReviewers = await Promise.all(
      reviews.map(async (r) => {
        const reviewer = await getUserById(r.reviewerId);
        return { ...r, reviewer: { name: reviewer?.name, avatar: reviewer?.avatar } };
      })
    );
    return withReviewers;
  }),

  getBySeller: publicProcedure.input(z.object({ sellerId: z.number() })).query(async ({ input }) => {
    const reviews = await getReviewsBySeller(input.sellerId, 20);
    const withReviewers = await Promise.all(
      reviews.map(async (r) => {
        const reviewer = await getUserById(r.reviewerId);
        return { ...r, reviewer: { name: reviewer?.name, avatar: reviewer?.avatar } };
      })
    );
    return withReviewers;
  }),

  getSellerRating: publicProcedure.input(z.object({ sellerId: z.number() })).query(async ({ input }) => {
    return getSellerRating(input.sellerId);
  }),

  getByOrder: protectedProcedure.input(z.object({ orderId: z.number() })).query(async ({ ctx, input }) => {
    const order = await getOrderById(input.orderId);
    if (!order) throw new TRPCError({ code: "NOT_FOUND" });
    if (order.buyerId !== ctx.user.id && order.sellerId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return getReviewByOrder(input.orderId);
  }),
});
