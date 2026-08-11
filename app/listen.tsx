import React from 'react';
import { MusicListenScreen } from '@/modules/music/ui/MusicListenScreen';
import { useMarkRouteMounted } from '@/shared/navigation/useMarkRouteMounted';

export default function ListenRoute() {
  useMarkRouteMounted('listen');
  return <MusicListenScreen />;
}
