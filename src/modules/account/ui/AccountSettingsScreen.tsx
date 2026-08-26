import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { useActivityStore } from '@/modules/account/state/activity-store';
import { useMusicLibraryStore } from '@/modules/music/state/music-library-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useFollowStore } from '@/modules/social/state/follow-store';
import { confirmDeleteAccount } from '@/modules/account/services/deleteAccountFlow';
import { purgeLocalAccountData } from '@/modules/account/services/purgeLocalAccountData';
import { openLegalDocument } from '@/shared/legal/openLegal';
import { colors } from '@/shared/theme/colors';
import { SettingsRow, SettingsSection } from './SettingsPrimitives';

export function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const profile = useLoyaltyStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const reports = useModerationStore((s) => s.reports);
  const openReports = reports.filter((r) => r.status === 'open').length;
  const activityCount = useActivityStore(
    (s) => s.entries.filter((e) => e.category !== 'shop' && e.subtitle !== 'สินค้า').length,
  );
  const musicCount = useMusicLibraryStore((s) => s.watchHistory.length);
  const [biometric, setBiometric] = useState(false);

  useEffect(() => {
    void LocalAuthentication.hasHardwareAsync().then(setBiometric);
  }, []);

  const loginLabel = useMemo(() => {
    if (user?.provider === 'apple') return 'เข้าสู่ระบบด้วยบัญชี Apple';
    if (user?.provider === 'google') return 'เข้าสู่ระบบด้วยบัญชี Google';
    if (user?.provider === 'facebook') return 'เข้าสู่ระบบด้วยบัญชี Facebook';
    if (user?.provider === 'phone') return 'เข้าสู่ระบบด้วยเบอร์โทรศัพท์';
    if (user?.provider === 'email') return 'เข้าสู่ระบบด้วยอีเมล';
    return 'ยังไม่ได้เข้าสู่ระบบ';
  }, [user?.provider]);

  const onDeleteAccount = () => {
    confirmDeleteAccount();
  };

  const onSignOut = () => {
    Alert.alert('ออกจากระบบ?', 'คุณจะต้องเข้าสู่ระบบอีกครั้งเพื่อใช้งานบัญชีนี้', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ออกจากระบบ',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await purgeLocalAccountData();
            useFeedStore.getState().switchAccount(null);
            useFollowStore.getState().reset();
            await useAuthStore.getState().clearSession();
            useLoyaltyStore.getState().deleteAccount();
            router.replace('/(tabs)/profile');
          })().catch(() => {
            Alert.alert('ออกจากระบบไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง');
          });
        },
      },
    ]);
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

        <SettingsSection title="ศูนย์กิจกรรมผู้ใช้" />
        <SettingsRow
          icon="time-outline"
          title="ประวัติโปรไฟล์"
          subtitle={`รับชม · ค้นหาเพื่อน · เพลง · แชต · ${activityCount + musicCount} รายการ`}
          onPress={() => router.push('/settings/activity')}
        />

        <SettingsSection title="ความเป็นส่วนตัวและความปลอดภัย" />
        <SettingsRow
          icon="finger-print-outline"
          title="Biometric"
          subtitle={
            biometric
              ? 'ลายนิ้วมือ / Face ID พร้อมใช้งานบนเครื่องนี้'
              : 'เครื่องนี้ยังไม่รองรับ Face ID หรือลายนิ้วมือ'
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
          subtitle="อ่านนโยบายความเป็นส่วนตัว"
          onPress={() => void openLegalDocument('privacy')}
        />
        <SettingsRow
          icon="reader-outline"
          title="ข้อกำหนดการใช้บริการ"
          subtitle="อ่านข้อกำหนดการใช้บริการ"
          onPress={() => void openLegalDocument('terms')}
        />

        <SettingsSection title="บัญชี" />
        <Pressable style={styles.signOutBtn} onPress={onSignOut} accessibilityRole="button">
          <Ionicons name="log-out-outline" size={19} color={colors.text.primary} />
          <Text style={styles.signOutText}>ออกจากระบบ</Text>
        </Pressable>

        <SettingsSection title="โซนอันตราย" />
        <Pressable style={styles.deleteBtn} onPress={onDeleteAccount} accessibilityRole="button">
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.deleteText}>ลบบัญชีและข้อมูลทั้งหมด</Text>
        </Pressable>
        <Text style={styles.hint}>
          เมื่อลบบัญชี ข้อมูลโปรไฟล์ โพสต์ และการล็อกอินจะถูกลบถาวร
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
  hint: { color: colors.text.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: 14,
    paddingVertical: 14,
  },
  signOutText: { color: colors.text.primary, fontWeight: '900', fontSize: 15 },
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
