import React from 'react';
import { CameraStudioScreen } from '@/modules/create/ui/CameraStudioScreen';
import { useMarkRouteMounted } from '@/shared/navigation/useMarkRouteMounted';

export default function CreateModalRoute() {
  useMarkRouteMounted('create-modal');
  return <CameraStudioScreen />;
}
