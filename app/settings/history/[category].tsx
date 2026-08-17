import { useLocalSearchParams } from 'expo-router';
import { ActivityHistoryScreen } from '@/modules/account/ui/ActivityHistoryScreen';
import { isActivityCategory } from '@/modules/account/domain/types';

export default function ActivityHistoryRoute() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const key = typeof category === 'string' && isActivityCategory(category) ? category : 'watch';
  return <ActivityHistoryScreen category={key} />;
}
