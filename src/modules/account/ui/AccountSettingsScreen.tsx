import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createWalletDomain } from '@/modules/wallet/services/WalletDomain';
import { useBoomWalletStore } from '@/modules/wallet/state/boom-wallet-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { exchangeSocialLogin, useAuthStore } from '@/modules/auth/state/auth-store';
import { useActivityStore } from '@/modules/account/state/activity-store';
import { useMusicLibraryStore } from '@/modules/music/state/music-library-store';
import { promptText } from '@/shared/components/AppPrompt';
import { confirmDeleteAccount } from '@/modules/account/services/deleteAccountFlow';
import { openLegalDocument } from '@/shared/legal/openLegal';
import { colors } from '@/shared/theme/colors';
import { SettingsRow, SettingsSection } from './SettingsPrimitives';

export function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const profile = useLoyaltyStore((s) => s.profile);
  const profileId = useBoomWalletStore((s) => s.profileId);
  const enablePin = useBoomWalletStore((s) => s.enablePin);
  const setSession = useAuthStore((s) => s.setSession);
  const user = useAuthStore((s) => s.user);
  const reports = useModerationStore((s) => s.reports);
  const openReports = reports.filter((r) => r.status === 'open').length;
  const activityCount = useActivityStore(
    (s) => s.entries.filter((e) => e.category !== 'shop' && e.subtitle !== 'สินค้า').length,
  );
  const musicCount = useMusicLibraryStore((s) => s.watchHistory.length);
  const [deviceCount, setDeviceCount] = useState(0);
  const [biometric, setBiometric] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleUser, setAppleUser] = useState<string | null>(null);

  useEffect(() => {
    setDeviceCount(createWalletDomain().security.listDevices(profileId).length);
    void LocalAuthentication.hasHardwareAsync().then(setBiometric);
    if (Platform.OS === 'ios') {
      void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
    void AsyncStorage.getItem('boommall-apple-user-id').then(setAppleUser);
  }, [profileId]);

  const loginLabel = useMemo(() => {
    if (appleUser) return 'เชื่อม Apple แล้ว';
    if (user?.provider === 'apple') return 'Sign in with Apple';
    if (user?.provider === 'google') return 'Google';
    if (user?.provider === 'facebook') return 'Facebook';
    if (user?.provider === 'email') return 'อีเมล';
    if (user) return user.provider;
    return 'ยังไม่ได้เข้าสู่ระบบ';
  }, [appleUser, user]);

  const setPin = () => {
    void promptText({
      title: 'ตั้ง Wallet PIN',
      message: 'PIN 6 หลัก — เก็บแบบ hash เท่านั้น',
      keyboardType: 'number-pad',
      secureTextEntry: true,
      maxLength: 6,
      okLabel: 'บันทึก',
    }).then((pin) => {
      if (pin == null) return;
      if (!/^\d{6}$/.test(pin)) {
        Alert.alert('PIN ไม่ถูกต้อง', 'ต้องเป็นตัวเลข 6 หลัก');
        return;
      }
      enablePin(pin);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('ตั้ง PIN แล้ว', 'ใช้ยืนยันก่อนโอน/จ่าย Coin');
    });
  };

  const onAppleSignIn = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.user || !cred.identityToken) {
        throw new Error('ไม่ได้รับ Apple identity token');
      }
      const name =
        [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') ||
        user?.displayName ||
        'Apple User';
      const session = await exchangeSocialLogin({
        provider: 'apple',
        providerUserId: cred.user,
        displayName: name,
        identityToken: cred.identityToken,
      });
      await setSession(session);
      await AsyncStorage.setItem('boommall-apple-user-id', cred.user);
      setAppleUser(cred.user);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('เข้าสู่ระบบด้วย Apple แล้ว', 'เซิร์ฟเวอร์ตรวจโทเคนกับ Apple แล้วออกเซสชันให้บัญชีนี้');
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('เข้าสู่ระบบไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่อีกครั้ง');
    }
  };

  const onDeleteAccount = () => {
    confirmDeleteAccount();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>การตั้งค่าบัญชี</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 48 }}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile.displayName.slice(0, 1)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{profile.displayName}</Text>
            <Text style={styles.profileHandle}>{profile.handle}</Text>
            <Text style={styles.profileMeta}>{loginLabel}</Text>
          </View>
        </View>

        <SettingsSection title="บัญชี" />
        <SettingsRow
          icon="card-outline"
          title="ช่องทางชำระเงิน"
          subtitle="TrueMoney · พร้อมเพย์ · บัตร · บัญชีธนาคาร"
          onPress={() => router.push('/settings/payments')}
        />
        <SettingsRow
          icon="phone-portrait-outline"
          title="อุปกรณ์ที่เข้าสู่ระบบ"
          subtitle={deviceCount ? `${deviceCount} เครื่องที่ใช้งานอยู่` : 'ยังไม่มีอุปกรณ์'}
          onPress={() => router.push('/settings/devices')}
        />
        {appleAvailable ? (
          <View style={styles.appleWrap}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={{ width: '100%', height: 44 }}
              onPress={() => void onAppleSignIn()}
            />
            <Text style={styles.hint}>
              {user?.provider === 'apple' || appleUser
                ? 'บัญชีนี้เข้าสู่ระบบด้วย Sign in with Apple แล้ว'
                : 'กดเพื่อเข้าสู่ระบบด้วย Apple — เซิร์ฟเวอร์ตรวจโทเคนก่อนออกเซสชัน'}
            </Text>
          </View>
        ) : (
          <SettingsRow
            icon="logo-apple"
            title="Sign in with Apple"
            subtitle="พร้อมบนอุปกรณ์ iOS ที่รองรับหลัง native build"
          />
        )}

        <SettingsSection title="ศูนย์กิจกรรมผู้ใช้" />
        <SettingsRow
          icon="time-outline"
          title="ประวัติโปรไฟล์"
          subtitle={`รับชม · ค้นหาเพื่อน · เพลง · แชต · ${activityCount + musicCount} รายการ`}
          onPress={() => router.push('/settings/activity')}
        />

        <SettingsSection title="ความเป็นส่วนตัวและความปลอดภัย" />
        <SettingsRow
          icon="keypad-outline"
          title="Wallet PIN 6 หลัก"
          subtitle="hash แล้วเก็บ — ห้าม plain text"
          onPress={setPin}
        />
        <SettingsRow
          icon="finger-print-outline"
          title="Biometric"
          subtitle={
            biometric
              ? 'ลายนิ้ว / Face ID พร้อมใช้งานบนเครื่องนี้'
              : 'biometric ยังไม่พร้อม — ใช้ PIN ได้'
          }
        />
        <SettingsRow
          icon="shield-checkmark-outline"
          title="ความปลอดภัยและ moderation"
          subtitle={`รายงานเปิด ${openReports} · บล็อกและสถานะเนื้อหา`}
          onPress={() => router.push('/settings/moderation')}
        />

        <SettingsSection title="นโยบายและข้อกำหนด" />
        <SettingsRow
          icon="document-text-outline"
          title="นโยบายความเป็นส่วนตัว"
          subtitle="เปิดลิงก์ HTTPS ในเบราว์เซอร์"
          onPress={() => void openLegalDocument('privacy')}
        />
        <SettingsRow
          icon="reader-outline"
          title="ข้อกำหนดการใช้บริการ (EULA)"
          subtitle="เปิดลิงก์ HTTPS ในเบราว์เซอร์"
          onPress={() => void openLegalDocument('terms')}
        />

        <SettingsSection title="โซนอันตราย" />
        <SettingsRow
          icon="trash-outline"
          title="ลบบัญชีและข้อมูลทั้งหมด"
          subtitle="Delete Account — Guideline 5.1.1v"
          danger
          onPress={onDeleteAccount}
        />
        <Pressable style={styles.deleteBtn} onPress={onDeleteAccount} accessibilityRole="button">
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.deleteText}>ลบบัญชีและข้อมูลทั้งหมด</Text>
        </Pressable>
        <Text style={styles.hint}>
          ตามแนวทาง Apple — ต้องลบบัญชีในแอปได้เอง ข้อมูลโปรไฟล์ โพสต์ และการล็อกอินจะถูกลบถาวร
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.text.primary },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    padding: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 20 },
  profileName: { fontWeight: '900', fontSize: 16, color: colors.text.primary },
  profileHandle: { color: colors.text.secondary, fontSize: 13, marginTop: 2 },
  profileMeta: { color: colors.text.muted, fontSize: 12, marginTop: 2 },
  appleWrap: { marginBottom: 4, gap: 8 },
  hint: { color: colors.text.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand.pink,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  deleteText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
