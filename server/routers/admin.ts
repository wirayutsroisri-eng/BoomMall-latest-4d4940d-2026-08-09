import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAllPayoutRequests,
  getAllSystemSettings,
  getAllUsers,
  getDashboardStats,
  getPayoutRequestsBySeller,
  getSystemSetting,
  setSystemSetting,
  updatePayoutStatus,
  updateUser,
  getUserById,
  getOrCreateWallet,
  addWalletTransaction,
  getPayoutRequestById,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin เท่านั้น" });
  return next({ ctx });
});

export const adminRouter = router({
  stats: adminProcedure.query(async () => {
    return getDashboardStats();
  }),

  settings: adminProcedure.query(async () => {
    return getAllSystemSettings();
  }),

  updateSetting: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await setSystemSetting(input.key, input.value, ctx.user.id);
      return { success: true };
    }),

  users: adminProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      return getAllUsers(input.limit, input.offset);
    }),

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ input }) => {
      await updateUser(input.userId, { role: input.role });
      return { success: true };
    }),

  payouts: adminProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const payouts = await getAllPayoutRequests(input.limit, input.offset);
      const withSellers = await Promise.all(
        payouts.map(async (p) => {
          const seller = await getUserById(p.sellerId);
          return { ...p, seller };
        })
      );
      return withSellers;
    }),

  approvePayout: adminProcedure
    .input(
      z.object({
        payoutId: z.number(),
        note: z.string().optional(),
        transferSlipBase64: z.string().optional(),
        transferSlipFilename: z.string().optional(),
        transferSlipContentType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let transferSlipUrl: string | undefined;

      if (input.transferSlipBase64 && input.transferSlipFilename) {
        const buffer = Buffer.from(input.transferSlipBase64, "base64");
        const key = `payout-slips/${Date.now()}-${input.transferSlipFilename}`;
        const { url } = await storagePut(key, buffer, input.transferSlipContentType ?? "image/jpeg");
        transferSlipUrl = url;
      }

      // Get payout to deduct seller wallet
      const payout = await getPayoutRequestById(input.payoutId);
      if (payout && payout.status === "pending") {
        const sellerWallet = await getOrCreateWallet(payout.sellerId);
        const amount = parseFloat(payout.amount as string);
        await addWalletTransaction({
          walletId: sellerWallet.id,
          userId: payout.sellerId,
          type: "payout",
          amount,
          referenceId: input.payoutId,
          referenceType: "payout",
          note: `โอนเงินให้ผู้ขาย`,
        });
      }

      await updatePayoutStatus(input.payoutId, "completed", ctx.user.id, input.note, transferSlipUrl);
      return { success: true };
    }),

  rejectPayout: adminProcedure
    .input(z.object({ payoutId: z.number(), note: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await updatePayoutStatus(input.payoutId, "rejected", ctx.user.id, input.note);
      return { success: true };
    }),
});
