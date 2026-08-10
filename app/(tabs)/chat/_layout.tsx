import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/shared/theme/colors';

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.canvas },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[conversationId]" />
      <Stack.Screen name="group/[groupId]" />
      <Stack.Screen
        name="add-friend"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}
