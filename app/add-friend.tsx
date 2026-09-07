import React from 'react';
import { Stack } from 'expo-router';
import { AddFriendScreen } from '@/modules/chat/ui/AddFriendScreen';
import { dismissibleModalOptions } from '@/shared/components/DragDownDismiss';

/** Target of boommall://add-friend?token=… when scanned with the system camera. */
export default function FriendInviteRoute() {
  return <>
    <Stack.Screen options={{ headerShown: false, ...dismissibleModalOptions }} />
    <AddFriendScreen />
  </>;
}
