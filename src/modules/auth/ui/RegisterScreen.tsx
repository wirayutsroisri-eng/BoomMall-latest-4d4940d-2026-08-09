import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import { AuthForm } from './AuthForm';

export function RegisterScreen() {
  const insets = useSafeAreaInsets();

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <DragDownDismiss onDismiss={close} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
          <Ionicons name="close" size={26} color={colors.text.primary} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <AuthForm
          mode="register"
          onAuthenticated={close}
          onClose={close}
          onSwitchMode={close}
        />
      </ScrollView>
    </DragDownDismiss>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.card,
  },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
