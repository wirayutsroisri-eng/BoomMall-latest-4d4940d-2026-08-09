import { useLocalSearchParams } from 'expo-router';
import { ShopHistoryScreen } from '@/modules/shop/ui/ShopHistoryScreen';
import { isShopHistoryCategory } from '@/modules/shop/domain/shop-activity';

export default function ShopHistoryRoute() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const key = typeof category === 'string' && isShopHistoryCategory(category) ? category : 'sales';
  return <ShopHistoryScreen category={key} />;
}
