import React, { useEffect, useRef, useState } from 'react';
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
  requestPhoneOtp,
  verifyPhoneOtp,
  useAuthStore,
  type SocialProvider,
} from '@/modules/auth/state/auth-store';
import { ENABLE_LINE_LOGIN } from '@/shared/compliance/appStoreGates';
import { openLegalDocument } from '@/shared/legal/openLegal';

WebBrowser.maybeCompleteAuthSession();

export type AuthFormMode = 'login' | 'register';

type Busy = SocialProvider | 'otp' | null;

type Props = {
  mode?: AuthFormMode;
  title?: string;
  message?: string;
  onAuthenticated?: () => void;
  onClose?: () => void;
  onSwitchMode?: (mode: AuthFormMode) => void;
};

function googleClientIds() {
  return {
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || '',
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() || '',
    web: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim() || '',
  };
}

function facebookAppId() {
  return process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim() || '';
}

function decodeJwtPayload(token: string): { sub?: string; name?: string } {
  try {
    const raw = token.split('.')[1] ?? '';
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
    const json = decodeURIComponent(
      Array.prototype.map
        .call(atob(padded.replace(/-/g, '+').replace(/_/g, '/')), (c: string) => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join(''),
    );
    return JSON.parse(json) as { sub?: string; name?: string };
  } catch {
    return {};
  }
}

/**
 * Apple + Google + Facebook + phone OTP (and email as a secondary path).
 * Apple stays on iOS whenever other social buttons are present (App Store 4.8).
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
  const [busy, setBusy] = useState<Busy>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpLock = useRef(false);

  const ids = googleClientIds();
  const fbId = facebookAppId();
  const showLine = ENABLE_LINE_LOGIN && Boolean(process.env.EXPO_PUBLIC_LINE_CHANNEL_ID);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const heading =
    title ?? (mode === 'register' ? 'สมัครบัญชี BoomMall' : 'เข้าสู่ระบบ BoomMall');
  const sub =
    message ??
    (mode === 'register'
      ? 'สมัครด้วย Apple, Google, Facebook หรือเบอร์โทร — ระบบตรวจกับผู้ให้บริการก่อนออกบัญชี'
      : 'เลือกช่องทางที่สะดวก บัญชีจะผูกกับเซิร์ฟเวอร์ BoomMall');

  const finishSocial = async (
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
      await finishSocial('apple', cred.user, name, cred.identityToken);
    } catch (e) {
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Sign in with Apple', e instanceof Error ? e.message : 'ไม่สำเร็จ');
    }
  };

  const onGoogle = async () => {
    const clientId = Platform.OS === 'ios' ? ids.ios || ids.web : ids.android || ids.web;
    if (!clientId) {
      Alert.alert(
        'Google Sign-In',
        'ยังไม่ได้ตั้งค่า Client ID — ใส่ EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ใน .env แล้วรีสตาร์ท Metro',
      );
      return;
    }
    setBusy('google');
    try {
      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'boommall', path: 'oauth' });
      const request = new AuthSession.AuthRequest({
        clientId,
        redirectUri,
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.IdToken,
        usePKCE: false,
        extraParams: { nonce: String(Date.now()) },
      });
      const result = await request.promptAsync({
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      });
      if (result.type !== 'success') return;
      const idToken = result.params.id_token;
      if (!idToken) throw new Error('ไม่ได้รับ Google id_token');
      const payload = decodeJwtPayload(idToken);
      if (!payload.sub) throw new Error('Google token ไม่มี sub');
      await finishSocial('google', payload.sub, payload.name || 'Google User', idToken);
    } catch (e) {
      Alert.alert('Google Sign-In', e instanceof Error ? e.message : 'ไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const onFacebook = async () => {
    if (!fbId) {
      Alert.alert(
        'Facebook Login',
        'ยังไม่ได้ตั้งค่า App ID — ใส่ EXPO_PUBLIC_FACEBOOK_APP_ID ใน .env แล้วรีสตาร์ทแอป',
      );
      return;
    }
    setBusy('facebook');
    try {
      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'boommall', path: 'oauth' });
      const request = new AuthSession.AuthRequest({
        clientId: fbId,
        redirectUri,
        scopes: ['public_profile', 'email'],
        responseType: AuthSession.ResponseType.Token,
      });
      const result = await request.promptAsync({
        authorizationEndpoint: 'https://www.facebook.com/v21.0/dialog/oauth',
      });
      if (result.type !== 'success') return;
      const accessToken = result.params.access_token;
      if (!accessToken) throw new Error('ไม่ได้รับ Facebook access token');
      const meRes = await fetch(
        `https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
      );
      const me = (await meRes.json()) as { id?: string; name?: string };
      if (!me.id) throw new Error('Facebook ไม่คืน user id');
      await finishSocial('facebook', me.id, me.name || 'Facebook User', accessToken);
    } catch (e) {
      Alert.alert('Facebook Login', e instanceof Error ? e.message : 'ไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const onLine = async () => {
    Alert.alert('LINE Login', 'ยังไม่เปิดในเวอร์ชันนี้ — ใช้ Apple, Google, Facebook หรือเบอร์โทร');
  };

  const onSendOtp = async () => {
    if (phone.replace(/\D/g, '').length < 9) {
      Alert.alert('เบอร์โทร', 'กรอกเบอร์มือถือไทย 10 หลัก เช่น 08x xxx xxxx');
      return;
    }
    setBusy('phone');
    try {
      const result = await requestPhoneOtp(phone);
      setOtpSent(true);
      setOtp('');
      setResendIn(result.resendInSec);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (result.debugCode) {
        Alert.alert(
          'ส่งรหัสแล้ว',
          `ส่งไปที่ ${result.phoneMasked}\n\nโหมดพัฒนา (ยังไม่ต่อ SMS จริง): ${result.debugCode}`,
        );
      } else {
        Alert.alert('ส่งรหัสแล้ว', `กรอกรหัส 6 หลักที่ส่งไปยัง ${result.phoneMasked}`);
      }
    } catch (e) {
      Alert.alert('ส่งรหัสไม่สำเร็จ', e instanceof Error ? e.message : 'ลองอีกครั้ง');
    } finally {
      setBusy(null);
    }
  };

  const onVerifyOtp = async (code: string) => {
    if (otpLock.current) return;
    if (!/^\d{6}$/.test(code)) return;
    otpLock.current = true;
    setBusy('otp');
    try {
      const session = await verifyPhoneOtp({ phone, code });
      await setSession(session);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAuthenticated?.();
      onClose?.();
    } catch (e) {
      Alert.alert('รหัสไม่ถูกต้อง', e instanceof Error ? e.message : 'ลองอีกครั้ง');
    } finally {
      otpLock.current = false;
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
          cornerRadius={14}
          style={styles.appleBtn}
          onPress={() => void onApple()}
        />
      ) : null}

      <Pressable
        style={[styles.btn, styles.google]}
        onPress={() => void onGoogle()}
        disabled={!!busy}
      >
        {busy === 'google' ? (
          <ActivityIndicator color="#1F1F1F" />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color="#EA4335" />
            <Text style={styles.googleText}>
              {mode === 'register' ? 'สมัครด้วย Google' : 'เข้าสู่ระบบด้วย Google'}
            </Text>
          </>
        )}
      </Pressable>

      <Pressable
        style={[styles.btn, styles.facebook]}
        onPress={() => void onFacebook()}
        disabled={!!busy}
      >
        {busy === 'facebook' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="logo-facebook" size={20} color="#fff" />
            <Text style={styles.btnText}>
              {mode === 'register' ? 'สมัครด้วย Facebook' : 'เข้าสู่ระบบด้วย Facebook'}
            </Text>
          </>
        )}
      </Pressable>

      {showLine ? (
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
      ) : null}

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>หรือเบอร์โทรศัพท์</Text>
        <View style={styles.orLine} />
      </View>

      <View style={styles.phoneCard}>
        <View style={styles.phoneRow}>
          <View style={styles.ccBox}>
            <Text style={styles.ccText}>+66</Text>
          </View>
          <TextInput
            style={styles.phoneInput}
            placeholder="8x xxx xxxx"
            placeholderTextColor={colors.text.muted}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            value={phone}
            onChangeText={setPhone}
            editable={!busy}
          />
        </View>

        {otpSent ? (
          <>
            <Text style={styles.otpHint}>รหัส 6 หลักจาก SMS</Text>
            <OtpBoxes
              value={otp}
              onChange={(next) => {
                setOtp(next);
                if (next.length === 6) void onVerifyOtp(next);
              }}
              disabled={!!busy}
            />
            <Pressable
              style={[styles.btn, styles.phoneBtn]}
              onPress={() => void onVerifyOtp(otp)}
              disabled={!!busy || otp.length !== 6}
            >
              {busy === 'otp' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>ยืนยันรหัส</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => void onSendOtp()}
              disabled={!!busy || resendIn > 0}
              style={styles.resendBtn}
            >
              <Text style={[styles.resendText, resendIn > 0 && styles.resendMuted]}>
                {resendIn > 0 ? `ส่งรหัสอีกครั้งใน ${resendIn} วินาที` : 'ส่งรหัสอีกครั้ง'}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.btn, styles.phoneBtn]}
            onPress={() => void onSendOtp()}
            disabled={!!busy}
          >
            {busy === 'phone' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                <Text style={styles.btnText}>ส่งรหัส SMS</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      <Pressable onPress={() => setShowEmail((v) => !v)} style={styles.emailToggle}>
        <Text style={styles.emailToggleText}>{showEmail ? 'ซ่อนอีเมล' : 'หรือใช้อีเมล'}</Text>
      </Pressable>

      {showEmail ? (
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
              <Text style={styles.btnText}>{mode === 'register' ? 'สมัครด้วยอีเมล' : 'เข้าสู่ระบบด้วยอีเมล'}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

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

function OtpBoxes({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.otpWrap}>
      <View style={styles.otpRow} pointerEvents="none">
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={[styles.otpBox, value[i] ? styles.otpBoxFilled : null]}>
            <Text style={styles.otpDigit}>{value[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        style={styles.otpHidden}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        caretHidden
        editable={!disabled}
        autoFocus
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text.primary, letterSpacing: -0.4 },
  msg: { fontSize: 14, lineHeight: 20, color: colors.text.secondary, marginBottom: 6 },
  appleBtn: { width: '100%', height: 52 },
  btn: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  google: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border.strong,
  },
  googleText: { color: '#1F1F1F', fontWeight: '800', fontSize: 15 },
  facebook: { backgroundColor: '#1877F2' },
  line: { backgroundColor: '#06C755' },
  phoneBtn: { backgroundColor: colors.brand.primaryDark },
  emailBtn: { backgroundColor: colors.brand.forest },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 2 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border.strong },
  orText: { fontSize: 12, fontWeight: '700', color: colors.text.muted },
  phoneCard: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.brand.mist,
    borderWidth: 1,
    borderColor: 'rgba(0,168,107,0.16)',
  },
  phoneRow: { flexDirection: 'row', gap: 8 },
  ccBox: {
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  ccText: { fontWeight: '800', color: colors.text.primary, fontSize: 15 },
  phoneInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: 12,
    color: colors.text.primary,
    backgroundColor: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  otpHint: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  otpWrap: { height: 56, justifyContent: 'center' },
  otpRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  otpBox: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border.strong,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: { borderColor: colors.brand.primaryDark },
  otpDigit: { fontSize: 22, fontWeight: '800', color: colors.text.primary },
  otpHidden: {
    ...StyleSheet.absoluteFill,
    opacity: 0.02,
    color: 'transparent',
  },
  resendBtn: { alignItems: 'center', paddingVertical: 2 },
  resendText: { fontSize: 13, fontWeight: '700', color: colors.brand.primaryDark },
  resendMuted: { color: colors.text.muted, fontWeight: '600' },
  emailToggle: { alignItems: 'center', paddingVertical: 4 },
  emailToggleText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  emailBox: { gap: 8 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: 12,
    color: colors.text.primary,
    backgroundColor: colors.surface.canvas,
  },
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
