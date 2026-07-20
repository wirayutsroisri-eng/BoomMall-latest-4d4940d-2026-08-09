import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { saveWebPushSubscription, removeWebPushSubscription } from "../webPush";
import { ENV } from "../_core/env";

export const pushRouter = router({
  // Get VAPID public key for frontend
  getVapidPublicKey: publicProcedure.query(() => {
    return { publicKey: ENV.vapidPublicKey };
  }),

  // Subscribe to push notifications
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string(),
          auth: z.string(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await saveWebPushSubscription(ctx.user.id, {
        endpoint: input.endpoint,
        keys: input.keys,
      });
      return { success: true };
    }),

  // Unsubscribe from push notifications
  unsubscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await removeWebPushSubscription(ctx.user.id, input.endpoint);
      return { success: true };
    }),
});
