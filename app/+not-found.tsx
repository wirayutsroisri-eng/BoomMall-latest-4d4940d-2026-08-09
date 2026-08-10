import React from 'react';
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/shared/theme/colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'ไม่พบหน้า', headerShown: true }} />
      <View style={styles.root}>
        <Text style={styles.title}>404</Text>
        <Link href="/" style={styles.link}>
          กลับหน้าแรก
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.canvas,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.primary,
  },
  link: {
    marginTop: 12,
    color: colors.brand.primaryDark,
    fontWeight: '700',
  },
});
