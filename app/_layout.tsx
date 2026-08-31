import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/shared/providers/AppProviders';
import { CallOverlay } from '@/modules/chat/ui/CallOverlay';
import { MusicMiniPlayer } from '@/modules/music/ui/MusicMiniPlayer';
import { dismissibleModalOptions } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface.canvas } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="listen"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="create-hub"
          options={{
            presentation: 'modal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen name="story-create" options={{ presentation: 'fullScreenModal', ...dismissibleModalOptions, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="story-viewer" options={{ presentation: 'fullScreenModal', ...dismissibleModalOptions, animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen
          name="video-feed"
          options={{
            presentation: 'transparentModal',
            animation: 'none',
            gestureEnabled: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen name="secondhand-create" options={{ presentation: 'fullScreenModal', ...dismissibleModalOptions, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="secondhand-drafts" options={{ presentation: 'modal', ...dismissibleModalOptions, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="secondhand/[listingId]" options={{ presentation: 'card', animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }} />
        <Stack.Screen
          name="create-modal"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="create-capture"
          options={{
            presentation: 'transparentModal',
            ...dismissibleModalOptions,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="media-gallery"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="board-create"
          options={{
            presentation: 'modal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="create-preview"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="create-editor"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="create-crop"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="create-publish"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="create-details"
          options={{
            presentation: 'modal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="creator/[handle]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="profile-feed"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="profile/edit"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="profile/edit-field"
          options={{
            presentation: 'modal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen name="profile/interests" options={{ presentation: 'modal', ...dismissibleModalOptions }} />
        <Stack.Screen
          name="search"
          options={{
            presentation: 'modal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="channel-search"
          options={{
            presentation: 'modal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="shop/search-results"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="qr-scan"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="vault/index"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="knowledge/index"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="orders"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="shop/product/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="shop/store/[shopKey]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="shop/image-search"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="shop/cart"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="shop/checkout"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="shop/payment"
          options={{
            presentation: 'modal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="store/manage"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="store/history/[category]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="store/dashboard"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="store/orders"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="store/shipping"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="store/returns"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="store/finance"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="store/payout"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="store/product/[id]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="products/[id]/edit"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="store/ledger"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="store/warehouse"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="store/install/[warehouseId]"
          options={{
            presentation: 'modal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen
          name="settings/index"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings/moderation"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings/activity"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings/history/[category]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings/devices"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings/payments"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="legal/[doc]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="register"
          options={{
            presentation: 'fullScreenModal',
            ...dismissibleModalOptions,
          }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
      <MusicMiniPlayer />
      <CallOverlay />
    </AppProviders>
  );
}
