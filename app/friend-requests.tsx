import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FriendRequestsPanel } from '@/modules/chat/ui/FriendRequestsPanel';
import { DragDownDismiss, dismissibleModalOptions } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

export default function FriendRequestsRoute() {
  const insets = useSafeAreaInsets();
  const close = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/chat');
  return <DragDownDismiss onDismiss={close} style={{ flex: 1, backgroundColor: colors.surface.canvas, paddingTop: insets.top + 12 }}>
    <Stack.Screen options={{ headerShown: false, ...dismissibleModalOptions }} />
    <Pressable onPress={close} accessibilityLabel="ปิด" style={{ padding: 16 }}><Text>✕ ปิด</Text></Pressable>
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}><FriendRequestsPanel showOutgoing /></ScrollView>
  </DragDownDismiss>;
}
