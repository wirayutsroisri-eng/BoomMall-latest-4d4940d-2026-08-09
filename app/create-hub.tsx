import React from 'react';
import { CreateHubScreen } from '@/modules/create/ui/CreateHubScreen';
import { useMarkRouteMounted } from '@/shared/navigation/useMarkRouteMounted';

export default function CreateHubRoute() {
  useMarkRouteMounted('create-hub');
  return <CreateHubScreen />;
}
