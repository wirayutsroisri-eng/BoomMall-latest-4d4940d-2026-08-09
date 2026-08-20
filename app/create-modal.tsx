import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

/** Legacy route — redirect to in-app capture screen. */
export default function CreateModalRoute() {
  useEffect(() => {
    router.replace('/create-capture');
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}
