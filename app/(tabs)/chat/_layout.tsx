import React from 'react';
import { Stack } from 'expo-router';
import { dismissibleModalOptions } from '@/shared/components/DragDownDismiss';
import { chatInboxPalette } from '@/modules/chat/ui/chatDayNight';

export default function ChatLayout() {
  const palette = chatInboxPalette();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.canvas },
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
