import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { OpenChatGroupScreen } from '@/modules/chat/ui/OpenChatGroupScreen';

export default function OpenChatGroupRoute() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OpenChatGroupScreen groupId={String(groupId)} />;
}
