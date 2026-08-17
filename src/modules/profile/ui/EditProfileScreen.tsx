import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import { pickProfileAvatar } from './AvatarPhotoHost';
import {
  profilePublicLink,
  stripHandle,
  type ProfileEditField,
} from '../domain/edit-profile';

const PAGE_BG = '#F2F2F7';

function openField(field: ProfileEditField) {
  void Haptics.selectionAsync();
  router.push({ pathname: '/profile/edit-field', params: { field } });
}

export function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const profile = useLoyaltyStore((s) => s.profile);
  const handle = stripHandle(profile.handle);
  const publicLink = profilePublicLink(profile.handle);

  const copyLink = async () => {
    await Clipboard.setStringAsync(publicLink);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          hitSlop={10}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
          accessibilityLabel="ย้อนกลับ"
        >
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.topTitle}>แก้ไขโปรไฟล์</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.avatarBlock}
          onPress={() => void pickProfileAvatar()}
          accessibilityLabel="เปลี่ยนรูปโปรไฟล์"
        >
          <View>
            <Avatar
              uri={profile.avatarUri}
              initial={profile.displayName.slice(0, 1)}
              size={96}
              radius={48}
              borderWidth={0}
            />
            <View style={styles.camBadge}>
              <Ionicons name="camera" size={16} color={colors.text.primary} />
            </View>
          </View>
          <Text style={styles.changePhoto}>เปลี่ยนรูป</Text>
        </Pressable>

        <View style={styles.card}>
          <Row
            label="ชื่อ"
            value={profile.displayName}
            onPress={() => openField('name')}
          />
          <Row
            label="ชื่อผู้ใช้งาน"
            value={handle}
            onPress={() => openField('username')}
          />
          <Pressable style={styles.row} onPress={() => void copyLink()}>
            <Text style={styles.linkText} numberOfLines={1}>
              {publicLink}
            </Text>
            <Ionicons name="copy-outline" size={18} color={colors.text.muted} />
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>ข้อมูลพื้นฐาน</Text>
        <View style={styles.card}>
          <Row
            label="ประวัติ"
            value={profile.bio.trim() || 'เขียนคำอธิบายสั้น ๆ ว่าคุณเป็นใคร หรือบัญชีของคุณเกี่ยวข้องกับอะไร'}
            placeholder={!profile.bio.trim()}
            onPress={() => openField('bio')}
          />
          <Row
            label="ลิงก์"
            value={profile.websiteUrl?.trim() || 'เพิ่มลิงก์'}
            placeholder={!profile.websiteUrl?.trim()}
            onPress={() => openField('link')}
            last
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({
  label,
  value,
  placeholder,
  trailing,
  last,
  onPress,
}: {
  label: string;
  value: string;
  placeholder?: boolean;
  trailing?: React.ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, placeholder && styles.rowPlaceholder]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={16} color="#C7C7CC" /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: PAGE_BG,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: colors.text.primary,
  },
  topSpacer: { width: 26 },
  avatarBlock: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 22,
  },
  camBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  changePhoto: {
    marginTop: 10,
    color: '#5AC8FA',
    fontSize: 15,
    fontWeight: '700',
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 8,
    marginHorizontal: 20,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
  },
  card: {
    marginHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  rowLabel: {
    width: 108,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15,
    color: colors.text.secondary,
  },
  rowPlaceholder: {
    color: '#C7C7CC',
  },
  linkText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.secondary,
  },
});
