import React from 'react';
import { BoardCreateModal } from '@/modules/matching/ui/BoardCreateModal';
import { useMarkRouteMounted } from '@/shared/navigation/useMarkRouteMounted';

export default function BoardCreateRoute() {
  useMarkRouteMounted('board-create');
  return <BoardCreateModal />;
}
