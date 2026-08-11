import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import {
  exchangeSocialLogin,
  useAuthStore,
  type SocialProvider,
} from '@/modules/auth/state/auth-store';

WebBrowser.maybeCompleteAuthSession();

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
  const setSession = useAuthStore((s) => s.setSession);
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  const finish = async (
    provider: SocialProvider,
    providerUserId: string,
    displayName: string,
    identityToken?: string,
  ) => {
    setBusy(provider);
    try {
      const session = await exchangeSocialLogin({
        provider,
        providerUserId,
        displayName,
        identityToken,
      });
      await setSession(session);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAuthenticated?.();
      onClose?.();
    } catch (e) {
      Alert.alert('เข้าสู่ระบบไม่สำเร็จ', e instanceof Error ? e.message : 'ลองอีกครั้ง');
    } finally {
      setBusy(null);
    }
  };

  const onApple = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.user) throw new Error('ไม่ได้รับ Apple user id');
      const name =
        [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') ||
        'Apple User';
      await finish('apple', cred.user, name, cred.identityToken ?? undefined);
    } catch (e) {
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple Sign-In', e instanceof Error ? e.message : 'ไม่สำเร็จ');
    }
  };

  const onGoogle = async () => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      if (__DEV__) {
        await finish('google', `dev-google-${Date.now()}`, 'Google User');
        return;
      }
      Alert.alert('Google Sign-In', 'ยังไม่ได้ตั้งค่า EXPO_PUBLIC_GOOGLE_CLIENT_ID');
      return;
    }
    setBusy('google');
    try {
      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'boommall' });
      const discovery = {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
      };
      const request = new AuthSession.AuthRequest({
        clientId,
        redirectUri,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.IdToken,
        usePKCE: false,
        extraParams: { nonce: String(Date.now()) },
      });
      const result = await request.promptAsync(discovery);
      if (result.type !== 'success') return;
      const idToken = result.params.id_token;
      if (!idToken) throw new Error('ไม่ได้รับ Google id_token');
      const payload = JSON.parse(
        (() => {
          try {
            const raw = idToken.split('.')[1] ?? '';
            const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
            return decodeURIComponent(
              Array.prototype.map
                .call(atob(padded.replace(/-/g, '+').replace(/_/g, '/')), (c: string) => {
                  return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                })
                .join(''),
            );
          } catch {
            return '{}';
          }
        })(),
      ) as { sub?: string; name?: string };
      if (!payload.sub) throw new Error('Google token ไม่มี sub');
      await finish('google', payload.sub, payload.name || 'Google User', idToken);
    } catch (e) {
      Alert.alert('Google Sign-In', e instanceof Error ? e.message : 'ไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const onLine = async () => {
    const channelId = process.env.EXPO_PUBLIC_LINE_CHANNEL_ID;
    if (!channelId) {
      if (__DEV__) {
        await finish('line', `dev-line-${Date.now()}`, 'LINE User');
        return;
      }
      Alert.alert('LINE Login', 'ยังไม่ได้ตั้งค่า EXPO_PUBLIC_LINE_CHANNEL_ID');
      return;
    }
    setBusy('line');
    try {
      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'boommall' });
      const discovery = {
        authorizationEndpoint: 'https://access.line.me/oauth2/v2.1/authorize',
        tokenEndpoint: 'https://api.line.me/oauth2/v2.1/token',
      };
      const request = new AuthSession.AuthRequest({
        clientId: channelId,
        redirectUri,
        scopes: ['profile', 'openid'],
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
      });
      const result = await request.promptAsync(discovery);
      if (result.type !== 'success' || !result.params.code) return;
      await finish('line', `line-code-${result.params.code.slice(0, 24)}`, 'LINE User');
    } catch (e) {
      Alert.alert('LINE Login', e instanceof Error ? e.message : 'ไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <DragDownDismiss
          onDismiss={onClose ?? (() => undefined)}
          enabled={Boolean(onClose)}
          showDim
          rootInModal
          style={styles.sheet}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.msg}>{message}</Text>

          {Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleBtn}
              onPress={() => void onApple()}
            />
          ) : null}

          <Pressable style={[styles.btn, styles.google]} onPress={() => void onGoogle()} disabled={!!busy}>
            {busy === 'google' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color="#fff" />
                <Text style={styles.btnText}>เข้าสู่ระบบด้วย Google</Text>
              </>
            )}
          </Pressable>

          <Pressable style={[styles.btn, styles.line]} onPress={() => void onLine()} disabled={!!busy}>
            {busy === 'line' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                <Text style={styles.btnText}>เข้าสู่ระบบด้วย LINE</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.legal}>
            การเข้าสู่ระบบถือว่าคุณยอมรับข้อกำหนดและนโยบายความเป็นส่วนตัวของ BoomMall
          </Text>
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
  title: { fontSize: 20, fontWeight: '900', color: colors.text.primary },
  msg: { fontSize: 14, lineHeight: 20, color: colors.text.secondary, marginBottom: 4 },
  appleBtn: { width: '100%', height: 48 },
  btn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  google: { backgroundColor: '#4285F4' },
  line: { backgroundColor: '#06C755' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  legal: {
    fontSize: 11,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 16,
  },
});
