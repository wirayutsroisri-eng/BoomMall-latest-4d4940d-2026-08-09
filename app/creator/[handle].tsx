import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { CreatorProfilePage } from '@/modules/profile/ui/CreatorProfileScreen';

/**
 * โปรไฟล์ครีเอเตอร์เต็มจอ — ใช้ native stack
 * ปัดจากขอบซ้ายไปขวา = กลับฟีดแบบ iOS (ไม่ใช่ custom pager ที่ค้าง)
 */
export default function CreatorProfileRoute() {
  const { handle, feedId } = useLocalSearchParams<{ handle: string; feedId?: string }>();
  const safeHandle = typeof handle === 'string' ? handle.replace(/^@/, '') : '';

  if (!safeHandle) {
    return null;
  }

  return (
    <CreatorProfilePage
      handle={safeHandle}
      feedId={typeof feedId === 'string' ? feedId : undefined}
      onClose={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
      }}
    />
  );
}
