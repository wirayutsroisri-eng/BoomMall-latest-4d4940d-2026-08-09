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
};

/**
 * Mandatory login for UGC (App Store 4.8 + 1.2).
 * Apple is always offered on iOS when Google/Facebook/phone are present.
 */
export function SocialLoginGate({
  visible,
  onClose,
  onAuthenticated,
  title = 'เข้าสู่ระบบเพื่อใช้งาน',
  message = 'เข้าสู่ระบบด้วย Apple, Google, Facebook หรือเบอร์โทรก่อนใช้ฟีด แชต โพสต์ หรือตลาด',
}: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthFormMode>('login');
  const scrollY = useSharedValue(0);

  const close = () => {
    setMode('login');
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.overlay,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <DragDownDismiss
            onDismiss={close}
            enabled={Boolean(onClose)}
            showDim
            rootInModal
            scrollY={scrollY}
            style={styles.sheet}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
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
                onClose={close}
                onSwitchMode={(next) => {
                  if (next === 'register') {
                    close();
                    safePush('/register');
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
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    maxHeight: '92%',
  },
});
