import { SellerShippingScreen } from '@/modules/store/ui/SellerShippingScreen';
import { ScreenErrorBoundary } from '@/shared/components/ScreenErrorBoundary';

export default function StoreShippingRoute() {
  return (
    <ScreenErrorBoundary title="เปิดหน้าจัดส่งไม่สำเร็จ">
      <SellerShippingScreen />
    </ScreenErrorBoundary>
  );
}
