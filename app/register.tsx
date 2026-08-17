import React from 'react';
import { RegisterScreen } from '@/modules/auth/ui/RegisterScreen';
import { useMarkRouteMounted } from '@/shared/navigation/useMarkRouteMounted';

export default function RegisterRoute() {
  useMarkRouteMounted('register');
  return <RegisterScreen />;
}
