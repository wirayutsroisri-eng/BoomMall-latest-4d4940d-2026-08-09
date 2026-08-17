import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useCreateStudioStore } from '@/modules/create/state/create-studio-store';

/** Legacy route: open the overlay gallery instead of a native fullScreenModal. */
export default function CreateModalRoute() {
  useEffect(() => {
    useCreateStudioStore.getState().open();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}
