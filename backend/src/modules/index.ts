/**
 * BoomMall — Core domains (Express + Prisma/Postgres + Socket.io/Redis)
 * 1) Auth & Profile (Apple / JWT + Admin RBAC)
 * 2) E-Commerce & Merchant (+ Catalog, Ads billing, GP ledger/PSP)
 * 3) Chat Real-Time (Socket.io / Redis + Social controls)
 * 4) Content Feed (+ Social posts on Postgres)
 */

export * as Auth from './auth';
export * as Ecommerce from './ecommerce';
export * as Chat from './chat';
export * as Feed from './feed';
export * as Finance from './finance';

import { authDomainStatus } from './auth/ProfileService';
import { authDomainJwtStatus } from './auth/JwtService';
import { ecommerceDomainStatus, getGpPolicy } from './ecommerce/GpLedgerService';
import { catalogDomainStatus } from './ecommerce/CatalogService';
import { adsDomainStatus } from './ecommerce/AdInventoryService';
import { promotionDomainStatus } from './ecommerce/ProductPromotionService';
import { commerceOpsStatus } from './ecommerce/CommerceService';
import { getChatRuntimeStatus } from './chat/services/ChatService';
import { chatSocialDomainStatus, getSocialPolicy } from './chat/policies/SocialControlPolicy';
import { contentFeedDomainStatus } from './feed/ContentFeedService';
import { socialFeedDomainExtras } from './feed/SocialPostService';
import { boardDomainStatus } from './board/BoardService';
import { pushDomainStatus } from './notify/PushService';
import { financeDomainStatus } from './finance/FinanceService';

export async function getPlatformDomainStatus() {
  const socialPolicy = await getSocialPolicy();
  return {
    domains: {
      authProfile: {
        ...authDomainStatus(),
        jwt: authDomainJwtStatus(),
        stack: 'express',
      },
      ecommerceMerchant: {
        ...ecommerceDomainStatus(),
        catalog: catalogDomainStatus(),
        ads: adsDomainStatus(),
        productPromotions: promotionDomainStatus(),
        commerce: commerceOpsStatus(),
        gp: await getGpPolicy(),
        finance: financeDomainStatus(),
      },
      chatRealtime: {
        ...(await getChatRuntimeStatus()),
        social: chatSocialDomainStatus(socialPolicy),
        storage: 'postgresql',
        mongoDeferred: true,
      },
      contentFeed: {
        ...(await contentFeedDomainStatus()),
        ...(await socialFeedDomainExtras()),
      },
      webboard: boardDomainStatus(),
      pushNotifications: pushDomainStatus(),
      financeSettlement: financeDomainStatus(),
    },
    policies: {
      marketplace: 'Ledger + Audit for GP; ads are billed as THB invoices via PSP',
      chatSocial:
        'Moderation + Report/Block + EULA (App Store C4) + rate/retention limits for OPEX',
      storage:
        'PostgreSQL durable store for catalog/ads/chat/posts; Redis optional for Socket.io scale',
    },
    generatedAt: new Date().toISOString(),
  };
}
