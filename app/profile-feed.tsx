import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ProfileFeedScreen } from '@/modules/profile/ui/ProfileFeedScreen';

export default function ProfileFeedRoute() {
  const { handle, startId } = useLocalSearchParams<{ handle?: string; startId?: string }>();
  const safeHandle = typeof handle === 'string' ? handle.replace(/^@/, '') : '';

  return (
    <ProfileFeedScreen
      handle={safeHandle}
      startId={typeof startId === 'string' ? startId : undefined}
    />
  );
}
