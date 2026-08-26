import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ShopSearchResultsScreen } from '@/modules/shop/ui/ShopSearchResultsScreen';

export default function ShopSearchResultsRoute() {
  const params = useLocalSearchParams<{ q?: string; label?: string }>();
  return (
    <ShopSearchResultsScreen
      query={typeof params.q === 'string' ? params.q : ''}
      label={typeof params.label === 'string' ? params.label : undefined}
    />
  );
}
