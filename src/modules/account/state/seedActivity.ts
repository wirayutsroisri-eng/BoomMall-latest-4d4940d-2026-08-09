import { useChatStore } from '@/modules/chat/state/chat-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { migrateShopActivityFromUserStore } from '@/modules/shop/state/migrateShopActivity';
import { useShopActivityStore } from '@/modules/shop/state/shop-activity-store';
import type { ActivityEntry } from '../domain/types';
import { useActivityStore } from './activity-store';

function applySeed() {
  const state = useActivityStore.getState();
  if (!state.seeded) {
    const now = Date.now();
    const seeded: ActivityEntry[] = [];

    useFeedStore
      .getState()
      .items.filter((item) => item.liked)
      .slice(0, 12)
      .forEach((item, i) => {
        seeded.push({
          id: `seed-watch-${item.id}`,
          category: 'watch',
          title: item.caption?.trim() || item.product?.name || 'คลิป',
          subtitle: item.author,
          targetId: item.id,
          at: new Date(now - i * 90_000).toISOString(),
        });
      });

    useChatStore
      .getState()
      .conversations.filter((c) => !c.isHidden)
      .slice(0, 10)
      .forEach((c, i) => {
        seeded.push({
          id: `seed-chat-${c.id}`,
          category: 'chat',
          title: c.peerName,
          subtitle: c.peerHandle,
          targetId: c.id,
          at: c.updatedAt || new Date(now - i * 120_000).toISOString(),
        });
      });

    state.markSeeded(seeded);
  }
  migrateShopActivityFromUserStore();
}

function whenHydrated(store: { persist: { hasHydrated: () => boolean; onFinishHydration: (cb: () => void) => () => void } }, fn: () => void) {
  if (store.persist.hasHydrated()) {
    fn();
    return;
  }
  const unsub = store.persist.onFinishHydration(() => {
    fn();
    unsub();
  });
}

/** ดึงประวัติจากข้อมูลที่มีอยู่แล้วในแอป — ไม่สร้างรายการปลอม */
export function seedActivityFromApp() {
  whenHydrated(useActivityStore, () => {
    whenHydrated(useShopActivityStore, applySeed);
  });
}
