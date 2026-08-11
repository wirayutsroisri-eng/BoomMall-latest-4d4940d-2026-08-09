import React, { useEffect, useState } from 'react';
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
import { colors } from '@/shared/theme/colors';

/**
 * Account + security settings — includes Apple-required Delete Account
 * and Sign in with Apple (Guideline 4.8 / 5.1.1v).
 */
export function WalletSecurityScreen() {
  const insets = useSafeAreaInsets();
  const profileId = useBoomWalletStore((s) => s.profileId);
  const enablePin = useBoomWalletStore((s) => s.enablePin);
  const deleteAccount = useLoyaltyStore((s) => s.deleteAccount);
  const reports = useModerationStore((s) => s.reports);
  const openReports = reports.filter((r) => r.status === 'open').length;
  const [devices, setDevices] = useState<
    Array<{ id: string; deviceName: string; lastSeenAt: string; approxLocation: string | null }>
  >([]);
  const [biometric, setBiometric] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleUser, setAppleUser] = useState<string | null>(null);

  const reload = () => {
    const domain = createWalletDomain();
    setDevices(domain.security.listDevices(profileId));
  };

  useEffect(() => {
    reload();
    void LocalAuthentication.hasHardwareAsync().then(setBiometric);
    if (Platform.OS === 'ios') {
      void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
    void AsyncStorage.getItem('boommall-apple-user-id').then(setAppleUser);
  }, [profileId]);

  const setPin = () => {
    Alert.prompt(
      'ตั้ง Wallet PIN',
      'PIN 6 หลัก — เก็บแบบ hash เท่านั้น (ไม่ใช่ plain text)',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'บันทึก',
          onPress: (pin?: string) => {
            if (!pin || !/^\d{6}$/.test(pin)) {
              Alert.alert('PIN ไม่ถูกต้อง', 'ต้องเป็นตัวเลข 6 หลัก');
              return;
            }
            enablePin(pin);
            Alert.alert('ตั้ง PIN แล้ว', 'ใช้ยืนยันก่อนโอน/จ่าย Coin');
          },
        },
      ],
      'secure-text',
    );
  };

  const onAppleSignIn = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (cred.user) {
        await AsyncStorage.setItem('boommall-apple-user-id', cred.user);
        setAppleUser(cred.user);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('เข้าสู่ระบบด้วย Apple แล้ว', 'บัญชีเชื่อมกับ Sign in with Apple เรียบร้อย');
      }
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('เข้าสู่ระบบไม่สำเร็จ', 'ลองใหม่อีกครั้ง');
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'ลบบัญชี',
      'จะลบโปรไฟล์ รายงานที่ค้าง และข้อมูลบัญชีบนเครื่องนี้ถาวร ไม่สามารถกู้คืนได้',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบบัญชี',
          style: 'destructive',
          onPress: () => {
            Alert.alert('ยืนยันอีกครั้ง', 'พิมพ์ยืนยันว่าต้องการลบบัญชี BoomMall', [
              { text: 'ยกเลิก', style: 'cancel' },
              {
                text: 'ลบถาวร',
                style: 'destructive',
                onPress: async () => {
                  deleteAccount();
                  useModerationStore.setState({ blockedUserIds: [], reports: [] });
                  await AsyncStorage.multiRemove([
                    'boommall-apple-user-id',
                    'boommall-moderation-v1',
                  ]);
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  Alert.alert('ลบบัญชีแล้ว', 'ข้อมูลบัญชีถูกลบจากเครื่องนี้');
                  router.replace('/(tabs)/profile');
                },
              },
            ]);
          },
        },
      ],
    );
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

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <Text style={styles.section}>เข้าสู่ระบบ</Text>
        {appleAvailable ? (
          <View style={{ gap: 10, marginBottom: 8 }}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={{ width: '100%', height: 44 }}
              onPress={() => void onAppleSignIn()}
            />
            {appleUser ? (
              <Text style={styles.rowSub}>เชื่อม Apple แล้ว · {appleUser.slice(0, 8)}…</Text>
            ) : (
              <Text style={styles.rowSub}>
                ใช้ Sign in with Apple ตามข้อกำหนด App Store เมื่อมีตัวเลือกเข้าสู่ระบบ
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.note}>
            Sign in with Apple พร้อมบนอุปกรณ์ iOS ที่รองรับ — เปิด capability หลัง native build
          </Text>
        )}

        <Text style={[styles.section, { marginTop: 18 }]}>Step-Up Authentication</Text>
        <Pressable style={styles.row} onPress={setPin}>
          <Ionicons name="keypad-outline" size={20} color={colors.text.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Wallet PIN 6 หลัก</Text>
            <Text style={styles.rowSub}>hash แล้วเก็บ — ห้าม plain text</Text>
          </View>
        </Pressable>
        <View style={styles.row}>
          <Ionicons name="finger-print-outline" size={20} color={colors.text.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Biometric</Text>
            <Text style={styles.rowSub}>
              {biometric ? 'ลายนิ้ว / Face ID พร้อมใช้งานบนเครื่องนี้' : 'biometric ยังไม่พร้อม — ใช้ PIN ได้'}
            </Text>
          </View>
        </View>

        <Text style={[styles.section, { marginTop: 22 }]}>อุปกรณ์ที่ Login</Text>
        {devices.map((d) => (
          <View key={d.id} style={styles.deviceCard}>
            <Text style={styles.rowTitle}>{d.deviceName}</Text>
            <Text style={styles.rowSub}>
              ล่าสุด {new Date(d.lastSeenAt).toLocaleString('th-TH')}
              {d.approxLocation ? ` · ${d.approxLocation}` : ''}
            </Text>
            <Pressable
              style={styles.revokeBtn}
              onPress={() => {
                createWalletDomain().security.revokeDevice(d.id);
                reload();
                Alert.alert('เพิกถอนแล้ว', 'Session อุปกรณ์นี้ถูก revoke แล้ว');
              }}
            >
              <Text style={styles.revokeText}>Logout / Revoke</Text>
            </Pressable>
          </View>
        ))}

        <Text style={[styles.section, { marginTop: 22 }]}>นโยบายและข้อกำหนด</Text>
        <Pressable
          style={styles.row}
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
        >
          <Ionicons name="document-text-outline" size={20} color={colors.text.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>นโยบายความเป็นส่วนตัว</Text>
            <Text style={styles.rowSub}>Privacy Policy</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
        >
          <Ionicons name="reader-outline" size={20} color={colors.text.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>ข้อกำหนดการใช้บริการ (EULA)</Text>
            <Text style={styles.rowSub}>Terms of Use</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
        </Pressable>

        <Text style={[styles.section, { marginTop: 22 }]}>บัญชีและความปลอดภัย</Text>
        <Text style={styles.note}>
          จัดการอุปกรณ์ที่ล็อกอิน Sign in with Apple และการลบบัญชีตามแนวทาง App Store
        </Text>

        <Text style={[styles.section, { marginTop: 22 }]}>Moderation Queue</Text>
        <Text style={styles.note}>
          คิวรายงานแบบย่อ — จัดการเต็มรูปแบบได้ที่เมนูความปลอดภัย
        </Text>
        <Pressable
          style={styles.row}
          onPress={() => router.push('/settings/moderation')}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.text.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>เปิดหน้า Moderation</Text>
            <Text style={styles.rowSub}>รายงานเปิด {openReports} · บล็อกและสถานะเนื้อหา</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
        </Pressable>

        <Text style={[styles.section, { marginTop: 28 }]}>โซนอันตราย</Text>
        <Pressable style={styles.deleteBtn} onPress={onDeleteAccount}>
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.deleteText}>ลบบัญชี (Delete Account)</Text>
        </Pressable>
        <Text style={styles.rowSub}>
          ตามแนวทาง Apple — ผู้ใช้ต้องลบบัญชีในแอปได้ด้วยตนเอง
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
  section: {
    fontWeight: '800',
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: '800', color: colors.text.primary, fontSize: 15 },
  rowSub: { color: colors.text.muted, fontSize: 12, marginTop: 2 },
  deviceCard: {
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 6,
  },
  revokeBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(254,44,85,0.12)',
  },
  revokeText: { color: '#FE2C55', fontWeight: '800', fontSize: 12 },
  note: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 14,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FE2C55',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  deleteText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
