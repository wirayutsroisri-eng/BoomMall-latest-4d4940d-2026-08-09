import React from 'react';
import { Stack } from 'expo-router';
import { dismissibleModalOptions } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000000' },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[conversationId]" />
      <Stack.Screen name="group/[groupId]" />
      <Stack.Screen
        name="add-friend"
        options={{
          presentation: 'modal',
          ...dismissibleModalOptions,
        }}
      />
    </Stack>
  );
}
