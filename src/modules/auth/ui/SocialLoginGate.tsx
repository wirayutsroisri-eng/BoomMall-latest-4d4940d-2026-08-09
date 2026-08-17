import React, { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
 * Mandatory social login for UGC (App Store 4.8 + 1.2).
 * Apple is always offered on iOS when Google/LINE are present.
 */
export function SocialLoginGate({
  visible,
  onClose,
  onAuthenticated,
  title = 'เข้าสู่ระบบเพื่อใช้งาน',
  message = 'ต้องเข้าสู่ระบบด้วยบัญชีโซเชียลก่อนใช้ฟีด แชต โพสต์ หรือตลาด',
}: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthFormMode>('login');

  const close = () => {
    setMode('login');
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
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
          style={styles.sheet}
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
        </DragDownDismiss>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    gap: 12,
  },
});
