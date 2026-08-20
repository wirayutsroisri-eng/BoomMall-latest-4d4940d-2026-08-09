type HydratableStore = {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (cb: () => void) => () => void;
  };
};

/** Run after zustand persist has loaded AsyncStorage — avoids wiping local data on cold start. */
export function whenStoreHydrated(store: HydratableStore, fn: () => void) {
  if (store.persist.hasHydrated()) {
    fn();
    return;
  }
  const unsub = store.persist.onFinishHydration(() => {
    fn();
    unsub();
  });
}

export function whenStoresHydrated(stores: HydratableStore[], fn: () => void) {
  let pending = stores.length;
  if (!pending) {
    fn();
    return;
  }
  for (const store of stores) {
    whenStoreHydrated(store, () => {
      pending -= 1;
      if (pending === 0) fn();
    });
  }
}
