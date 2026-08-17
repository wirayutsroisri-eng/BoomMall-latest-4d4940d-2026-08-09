import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/theme/colors';
import {
  exchangeSocialLogin,
  exchangeEmailLogin,
  useAuthStore,
  type SocialProvider,
} from '@/modules/auth/state/auth-store';
import { ENABLE_LINE_LOGIN } from '@/shared/compliance/appStoreGates';
import { openLegalDocument } from '@/shared/legal/openLegal';

WebBrowser.maybeCompleteAuthSession();

export type AuthFormMode = 'login' | 'register';

type Props = {
  mode?: AuthFormMode;
  title?: string;
  message?: string;
  onAuthenticated?: () => void;
  onClose?: () => void;
  onSwitchMode?: (mode: AuthFormMode) => void;
};

/**
 * Shared Apple / Google / Facebook + email auth.
 * Apple is always offered on iOS when other social providers are present (4.8).
 * LINE stays hidden until the API verifies LINE tokens.
 */
export function AuthForm({
  mode = 'login',
  title,
  message,
  onAuthenticated,
  onClose,
  onSwitchMode,
}: Props) {
  const setSession = useAuthStore((s) => s.setSession);
  const [busy, setBusy] = useState<SocialProvider | 'email' | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const showGoogle = Boolean(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID);
  const showLine = ENABLE_LINE_LOGIN && Boolean(process.env.EXPO_PUBLIC_LINE_CHANNEL_ID);
  const showFacebook = Boolean(process.env.EXPO_PUBLIC_FACEBOOK_APP_ID);

  const heading =
    title ?? (mode === 'register' ? 'สมัครบัญชี BoomMall' : 'เข้าสู่ระบบเพื่อใช้งาน');
  const sub =
    message ??
    (mode === 'register'
      ? 'สมัครด้วย Apple, Google หรืออีเมล — เซิร์ฟเวอร์ตรวจโทเคนกับผู้ให้บริการก่อนออกบัญชี'
      : 'เข้าสู่ระบบด้วยบัญชีโซเชียลหรืออีเมลที่ตรวจกับผู้ให้บริการแล้ว');

  const finish = async (
    provider: SocialProvider,
    providerUserId: string,
    name: string,
    identityToken?: string,
  ) => {
    setBusy(provider);
    try {
      const session = await exchangeSocialLogin({
        provider,
        providerUserId,
        displayName: name,
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
      if (!cred.identityToken) throw new Error('ไม่ได้รับ Apple identity token');
      const name =
        [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') ||
        'Apple User';
      await finish('apple', cred.user, name, cred.identityToken);
    } catch (e) {
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple Sign-In', e instanceof Error ? e.message : 'ไม่สำเร็จ');
    }
  };

  const onGoogle = async () => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      Alert.alert('Google Sign-In', 'ยังไม่ได้ตั้งค่า Google Client ID');
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
    Alert.alert('LINE Login', 'ยังไม่เปิดในเวอร์ชันนี้ — ใช้ Apple, Google หรืออีเมล');
  };

  const onFacebook = async () => {
    const appId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
    if (!appId) {
      Alert.alert('Facebook Login', 'ยังไม่ได้ตั้งค่า Facebook App ID');
      return;
    }
    setBusy('facebook');
    try {
      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'boommall' });
      const discovery = {
        authorizationEndpoint: 'https://www.facebook.com/v21.0/dialog/oauth',
        tokenEndpoint: 'https://graph.facebook.com/v21.0/oauth/access_token',
      };
      const request = new AuthSession.AuthRequest({
        clientId: appId,
        redirectUri,
        scopes: ['public_profile', 'email'],
        responseType: AuthSession.ResponseType.Token,
      });
      const result = await request.promptAsync(discovery);
      if (result.type !== 'success') return;
      const accessToken = result.params.access_token;
      if (!accessToken) throw new Error('ไม่ได้รับ Facebook access token');
      const meRes = await fetch(
        `https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
      );
      const me = (await meRes.json()) as { id?: string; name?: string };
      if (!me.id) throw new Error('Facebook ไม่คืน user id');
      await finish('facebook', me.id, me.name || 'Facebook User', accessToken);
    } catch (e) {
      Alert.alert('Facebook Login', e instanceof Error ? e.message : 'ไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const onEmail = async () => {
    if (!email.trim() || password.length < 8) {
      Alert.alert('อีเมล', 'ใส่อีเมลและรหัสผ่านอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (mode === 'register' && password !== confirm) {
      Alert.alert('รหัสผ่าน', 'รหัสผ่านยืนยันไม่ตรงกัน');
      return;
    }
    setBusy('email');
    try {
      const session = await exchangeEmailLogin({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
        mode,
      });
      await setSession(session);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAuthenticated?.();
      onClose?.();
    } catch (e) {
      Alert.alert(
        mode === 'register' ? 'สมัครไม่สำเร็จ' : 'เข้าสู่ระบบไม่สำเร็จ',
        e instanceof Error ? e.message : 'ลองอีกครั้ง',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.body}>
      <Text style={styles.title}>{heading}</Text>
      <Text style={styles.msg}>{sub}</Text>

      {Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            mode === 'register'
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={styles.appleBtn}
          onPress={() => void onApple()}
        />
      ) : null}

      {showGoogle ? (
        <Pressable style={[styles.btn, styles.google]} onPress={() => void onGoogle()} disabled={!!busy}>
          {busy === 'google' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color="#fff" />
              <Text style={styles.btnText}>
                {mode === 'register' ? 'สมัครด้วย Google' : 'เข้าสู่ระบบด้วย Google'}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}

      {showLine ? (
        <Pressable style={[styles.btn, styles.line]} onPress={() => void onLine()} disabled={!!busy}>
          {busy === 'line' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
              <Text style={styles.btnText}>
                {mode === 'register' ? 'สมัครด้วย LINE' : 'เข้าสู่ระบบด้วย LINE'}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}

      {showFacebook ? (
        <Pressable style={[styles.btn, styles.facebook]} onPress={() => void onFacebook()} disabled={!!busy}>
          {busy === 'facebook' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-facebook" size={18} color="#fff" />
              <Text style={styles.btnText}>
                {mode === 'register' ? 'สมัครด้วย Facebook' : 'เข้าสู่ระบบด้วย Facebook'}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}

      <View style={styles.emailBox}>
        {mode === 'register' ? (
          <TextInput
            style={styles.input}
            placeholder="ชื่อที่แสดง"
            placeholderTextColor={colors.text.muted}
            value={displayName}
            onChangeText={setDisplayName}
          />
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="อีเมล"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)"
          placeholderTextColor={colors.text.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {mode === 'register' ? (
          <TextInput
            style={styles.input}
            placeholder="ยืนยันรหัสผ่าน"
            placeholderTextColor={colors.text.muted}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
          />
        ) : null}
        <Pressable style={[styles.btn, styles.emailBtn]} onPress={() => void onEmail()} disabled={!!busy}>
          {busy === 'email' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>{mode === 'register' ? 'สมัครบัญชี' : 'เข้าสู่ระบบ'}</Text>
          )}
        </Pressable>
      </View>

      {onSwitchMode ? (
        <Pressable onPress={() => onSwitchMode(mode === 'register' ? 'login' : 'register')}>
          <Text style={styles.switchText}>
            {mode === 'register' ? 'มีบัญชีแล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัคร'}
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.legal}>
        การ{mode === 'register' ? 'สมัคร' : 'เข้าสู่ระบบ'}ถือว่าคุณยอมรับ
      </Text>
      <View style={styles.legalRow}>
        <Pressable onPress={() => void openLegalDocument('terms')}>
          <Text style={styles.legalLink}>ข้อกำหนดการใช้บริการ</Text>
        </Pressable>
        <Text style={styles.legalSep}>และ</Text>
        <Pressable onPress={() => void openLegalDocument('privacy')}>
          <Text style={styles.legalLink}>นโยบายความเป็นส่วนตัว</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
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
  facebook: { backgroundColor: '#1877F2' },
  emailBox: { gap: 8, marginTop: 4 },
  input: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: 12,
    color: colors.text.primary,
    backgroundColor: colors.surface.canvas,
  },
  emailBtn: { backgroundColor: colors.brand.primary },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  switchText: {
    textAlign: 'center',
    color: colors.text.secondary,
    fontWeight: '700',
    fontSize: 13,
    paddingVertical: 4,
  },
  legal: {
    fontSize: 11,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  legalLink: { fontSize: 11, fontWeight: '700', color: colors.brand.primaryDark },
  legalSep: { fontSize: 11, color: colors.text.muted },
});
