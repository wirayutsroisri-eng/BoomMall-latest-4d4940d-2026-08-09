import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChannelSearchScreen } from '@/modules/search/ui/ChannelSearchScreen';

export default function ChannelSearchRoute() {
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  return <ChannelSearchScreen scope={typeof scope === 'string' ? scope : 'feed'} />;
}
