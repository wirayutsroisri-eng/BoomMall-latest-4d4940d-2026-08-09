import type { ShopHistoryCategory } from '@/modules/shop/domain/shop-activity';
import { SellerShippingScreen } from '@/modules/store/ui/SellerShippingScreen';
import { ScreenErrorBoundary } from '@/shared/components/ScreenErrorBoundary';

export function ShopHistoryScreen(_props: { category: ShopHistoryCategory }) {
  return (
    <ScreenErrorBoundary title="เปิดหน้าจัดส่งไม่สำเร็จ">
      <SellerShippingScreen />
    </ScreenErrorBoundary>
  );
}
