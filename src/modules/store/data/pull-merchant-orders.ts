import { fetchMerchantOrders } from '@/modules/commerce/data/commerceApi';
import { incomingFromCommerceOrder } from '@/modules/store/domain/commerce-order-map';
import { useOrdersStore } from '@/modules/store/state/orders-store';

/** Pull paid checkout orders into the seller fulfillment queue. */
export async function pullMerchantIncomingOrders() {
  const res = await fetchMerchantOrders();
  const rows = Array.isArray(res.data) ? res.data : [];
  const mapped = [];
  for (const row of rows) {
    try {
      mapped.push(incomingFromCommerceOrder(row));
    } catch (error) {
      console.error('[MERCHANT_ORDERS] Invalid server row', row.id, error);
    }
  }
  if (mapped.length) useOrdersStore.getState().upsertIncoming(mapped);
}
