import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addWalletTransaction,
  getOrCreateWallet,
  getWalletByUserId,
  getWalletTransactions,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

export const walletRouter = router({
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const wallet = await getOrCreateWallet(ctx.user.id);
    return {
      balance: parseFloat(wallet.balance as string),
      walletId: wallet.id,
    };
  }),

  getTransactions: protectedProcedure
    .input(z.object({ limit: z.number().default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      return getWalletTransactions(ctx.user.id, input.limit, input.offset);
    }),

  // Top-up wallet (admin manually confirms after slip verification)
  topupRequest: protectedProcedure
    .input(
      z.object({
        amount: z.number().min(10).max(100000),
        slipBase64: z.string(),
        slipFilename: z.string(),
        slipContentType: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.slipBase64, "base64");
      const key = `topup-slips/${ctx.user.id}/${Date.now()}-${input.slipFilename}`;
      const { url } = await storagePut(key, buffer, input.slipContentType);

      // Return slip URL for admin to verify
      return {
        success: true,
        slipUrl: url,
        message: "อัปโหลดสลิปแล้ว รอ Admin ยืนยัน",
      };
    }),

  // Admin manually adds balance after verifying topup
  adminTopup: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        amount: z.number().min(1),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const wallet = await getOrCreateWallet(input.userId);
      await addWalletTransaction({
        walletId: wallet.id,
        userId: input.userId,
        type: "topup",
        amount: input.amount,
        note: input.note ?? "Admin เติมเงิน",
      });

      return { success: true };
    }),
});
