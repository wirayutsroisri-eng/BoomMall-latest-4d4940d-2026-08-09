import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import { safePush } from '@/shared/navigation/safeNavigate';
import { AuthForm, type AuthFormMode } from './AuthForm';

type Props = {
  visible: boolean;
  onClose?: () => void;
  /** Called after successful login */
  onAuthenticated?: () => void;
  title?: string;
  message?: string;
  /** Mandatory gates cannot be dismissed until authentication succeeds. */
  dismissible?: boolean;
};

/**
 * Mandatory login for UGC (App Store 4.8 + 1.2).
 * Apple is always offered on iOS when Google/Facebook/phone are present.
 */
export function SocialLoginGate({
  visible,
  onClose,
  onAuthenticated,
  title,
  message = 'เลือกช่องทางที่พร้อมใช้งานเพื่อเข้าสู่ระบบก่อนใช้ฟีด แชต โพสต์ หรือตลาด',
  dismissible = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthFormMode>('login');
  const scrollY = useSharedValue(0);

  const close = () => {
    if (!dismissible) return;
    setMode('login');
    onClose?.();
  };

  return (
    <Modal
      visible={visible}
      transparent={dismissible}
      animationType="slide"
      onRequestClose={dismissible ? close : undefined}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={dismissible && Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.overlay,
            !dismissible && styles.mandatoryOverlay,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <DragDownDismiss
            onDismiss={close}
            enabled={dismissible && Boolean(onClose)}
            showDim={dismissible}
            dimPressToDismiss={dismissible && Boolean(onClose)}
            rootInModal
            rootStyle={!dismissible ? styles.mandatoryRoot : undefined}
            scrollY={scrollY}
            style={[styles.sheet, !dismissible && styles.mandatorySheet]}
          >
            <ScrollView
              style={!dismissible ? styles.mandatoryScroll : undefined}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets={false}
              contentInsetAdjustmentBehavior="never"
              showsVerticalScrollIndicator={false}
              onScroll={(e) => {
                scrollY.value = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
            >
              <AuthForm
                mode={mode}
                title={title}
                message={message}
                onAuthenticated={onAuthenticated}
                onClose={dismissible ? close : undefined}
                onSwitchMode={(next) => {
                  if (next === 'register') {
                    if (dismissible) {
                      close();
                      safePush('/register');
                    } else {
                      setMode('register');
                    }
                    return;
                  }
                  setMode(next);
                }}
              />
            </ScrollView>
          </DragDownDismiss>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  mandatoryOverlay: {
    backgroundColor: colors.surface.card,
  },
  mandatoryRoot: {
    backgroundColor: colors.surface.card,
  },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    maxHeight: '92%',
  },
  mandatorySheet: {
    flex: 1,
    maxHeight: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  mandatoryScroll: {
    flex: 1,
  },
});
