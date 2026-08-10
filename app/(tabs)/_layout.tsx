import React from 'react';
import { Tabs, router } from 'expo-router';
import { MainTabBar } from '@/shared/components/MainTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <MainTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'หน้าแรก' }} />
      <Tabs.Screen name="shop" options={{ title: 'ร้านค้า' }} />
      <Tabs.Screen
        name="create"
        options={{ title: 'สร้าง' }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/create-modal');
          },
        }}
      />
      <Tabs.Screen name="chat" options={{ title: 'แชต', headerShown: false }} />
      <Tabs.Screen name="profile" options={{ title: 'โปรไฟล์' }} />
    </Tabs>
  );
}
