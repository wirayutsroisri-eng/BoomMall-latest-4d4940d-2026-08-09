import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearChatCache } from '@/modules/chat/data/chatLocalDb';
import { stopChatRealtime } from '@/modules/chat/data/chatSocket';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { useCartStore } from '@/modules/commerce/state/cart-store';
import { useCheckoutStore } from '@/modules/commerce/state/checkout-store';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { DEFAULT_CUSTOM_FIELDS } from '@/modules/commerce/data/catalog';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import { useBuyerPaymentStore } from '@/modules/account/state/buyer-payment-store';
import { useSellerWithdrawStore } from '@/modules/store/state/seller-withdraw-store';
import { useStockAlertsStore } from '@/modules/store/state/stock-alerts-store';
import { BASE_CATEGORIES, useCategoriesStore } from '@/modules/store/state/categories-store';
import { useWarehouseStore } from '@/modules/warehouse/state/warehouse-store';
import { useVaultStore } from '@/modules/vault/state/vault-store';
import { useSecondhandUiStore } from '@/modules/secondhand/state/secondhand-ui-store';
import { SECONDHAND_DRAFT_KEY } from '@/modules/secondhand/data/secondhandDraft';
import { useMusicLibraryStore } from '@/modules/music/state/music-library-store';

const LOCAL_ACCOUNT_OWNER_KEY = 'boommall-local-account-owner';

const ACCOUNT_STORAGE_KEYS = [
  'boommall-profile-storage',
  'boommall-feed-v4',
  'boommall-moderation-v1',
  'boommall-activity-v1',
  'boommall-shop-activity-v1',
  'boommall-inventory-storage-v3',
  'boommall-inventory-storage-v4',
  'boommall-warehouse-storage',
  'boommall-buyer-payment-v1',
  'boommall-seller-withdraw-v1',
  'boommall-stock-alerts',
  'boommall-shop-categories',
  'boommall.music.library.v4',
  SECONDHAND_DRAFT_KEY,
  'boommall-apple-user-id',
  LOCAL_ACCOUNT_OWNER_KEY,
];

/** Purge all device state before a different account is allowed to hydrate. */
export async function purgeLocalAccountData() {
  stopChatRealtime();
  useChatStore.setState({
    conversations: [], messagesById: {}, notes: [], myStatus: null, myNote: null,
    hiddenUnlocked: false, activeConversationId: null, hasMoreOlderById: {},
    loadingOlderById: {}, hydratingInbox: false,
  });
  useCartStore.getState().clear();
  useCheckoutStore.getState().resetAccountData();
  useOrdersStore.setState({ myOrders: [], incomingOrders: [], inquiries: [] });
  useInventoryStore.setState({
    masters: [], variants: [], stockByKey: {}, customFieldDefs: DEFAULT_CUSTOM_FIELDS,
    ledger: [], _lockEpoch: 0,
  });
  useWarehouseStore.setState({
    warehouses: [], members: [], invitations: [], requests: [], listings: [],
    autoSync: [], audit: [], profiles: [],
  });
  useBuyerPaymentStore.setState({ instruments: [] });
  useSellerWithdrawStore.setState({ destination: null, requests: [] });
  useStockAlertsStore.setState({ seen: {} });
  useCategoriesStore.setState({ categories: BASE_CATEGORIES });
  useSecondhandUiStore.getState().clearDraft();
  useMusicLibraryStore.setState({
    ready: false, uploads: [], loadedIds: [], localUriById: {}, pinnedIds: [],
    hiddenIds: [], recentPlayIds: [], playCountById: {}, genrePlayCount: {},
    viewCountById: {}, watchHistory: [],
  });

  await Promise.all([
    clearChatCache(),
    useVaultStore.getState().deleteAccountData(),
    AsyncStorage.multiRemove(ACCOUNT_STORAGE_KEYS),
  ]);
}

/** Prevent persisted state from account A being adopted by account B. */
export async function prepareLocalAccountData(userId: string) {
  const next = userId.trim();
  if (!next) return;
  const previous = await AsyncStorage.getItem(LOCAL_ACCOUNT_OWNER_KEY);
  // A missing owner with persisted account data is legacy/untrusted state.
  // Purge it as well so a freshly registered account cannot inherit products.
  if (!previous || previous !== next) await purgeLocalAccountData();
  await AsyncStorage.setItem(LOCAL_ACCOUNT_OWNER_KEY, next);
}
