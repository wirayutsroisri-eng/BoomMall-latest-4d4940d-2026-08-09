import React, { useState } from 'react';
import { Tabs, router } from 'expo-router';
import { MainTabBar } from '@/shared/components/MainTabBar';
import { openCreateHub } from '@/shared/navigation/safeNavigate';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { SocialLoginGate } from '@/modules/auth/ui/SocialLoginGate';

type PendingAction = 'feed' | 'shop' | 'create' | 'chat' | null;

/**
 * Social login is mandatory before Feed / Shop / Create / Chat (UGC + marketplace).
 */
export default function TabsLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);

  const requireAuth = (action: Exclude<PendingAction, null>, proceed?: () => void) => {
    if (!hydrated) return;
    if (isAuthenticated()) {
      proceed?.();
      return;
    }
    setPending(action);
    setLoginOpen(true);
  };

  return (
    <>
      <Tabs
        tabBar={(props) => <MainTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'หน้าแรก' }}
          listeners={{
            tabPress: (e) => {
              if (isAuthenticated()) return;
              e.preventDefault();
              requireAuth('feed');
            },
          }}
        />
        <Tabs.Screen
          name="shop"
          options={{ title: 'ร้านค้า' }}
          listeners={{
            tabPress: (e) => {
              if (isAuthenticated()) return;
              e.preventDefault();
              requireAuth('shop');
            },
          }}
        />
        <Tabs.Screen
          name="create"
          options={{ title: 'สร้าง' }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              requireAuth('create', () => openCreateHub());
            },
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{ title: 'แชต', headerShown: false }}
          listeners={{
            tabPress: (e) => {
              if (isAuthenticated()) return;
              e.preventDefault();
              requireAuth('chat');
            },
          }}
        />
        <Tabs.Screen name="profile" options={{ title: 'โปรไฟล์' }} />
      </Tabs>

      <SocialLoginGate
        visible={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          setPending(null);
        }}
        onAuthenticated={() => {
          setLoginOpen(false);
          const next = pending;
          setPending(null);
          if (next === 'create') openCreateHub();
          else if (next === 'chat') router.push('/(tabs)/chat');
          else if (next === 'shop') router.push('/(tabs)/shop');
          else if (next === 'feed') router.push('/(tabs)');
        }}
      />
    </>
  );
}
