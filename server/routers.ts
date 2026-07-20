import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { productsRouter } from "./routers/products";
import { kycRouter } from "./routers/kyc";
import { walletRouter } from "./routers/wallet";
import { ordersRouter } from "./routers/orders";
import { reviewsRouter } from "./routers/reviews";
import { adminRouter } from "./routers/admin";
import { cartRouter } from "./routers/cart";
import { chatRouter } from "./routers/chat";
import { likesRouter } from "./routers/likes";
import { sellerStoreRouter } from "./routers/sellerStore";
import { pushRouter } from "./routers/push";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  products: productsRouter,
  kyc: kycRouter,
  wallet: walletRouter,
  orders: ordersRouter,
  reviews: reviewsRouter,
  admin: adminRouter,
  cart: cartRouter,
  chat: chatRouter,
  likes: likesRouter,
  sellerStore: sellerStoreRouter,
  push: pushRouter,
});

export type AppRouter = typeof appRouter;
