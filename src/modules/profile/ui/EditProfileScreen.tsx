import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import { pickProfileAvatar, pickProfileCover } from './AvatarPhotoHost';
import { saveProfilePhoto } from '../data/syncOwnProfile';
import { apiUpsertProfile } from '@/modules/social/data/socialApi';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import {
  cooldownUntil,
  formatCooldownDate,
  formatHandle,
  normalizeWebsite,
  stripHandle,
  type ProfileEditField,
} from '../domain/edit-profile';
import { PROFILE_COVER_HEIGHT } from '../domain/profile-cover';

const PAGE_BG = '#F2F2F7';
const PINK = '#FE2C55';

function openField(field: ProfileEditField) {
  void Haptics.selectionAsync();
  router.push({ pathname: '/profile/edit-field', params: { field } });
}

export function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const profile = useLoyaltyStore((s) => s.profile);
  const updateProfile = useLoyaltyStore((s) => s.updateProfile);
  const renameOwnPosts = useFeedStore((s) => s.renameOwnPosts);

  // สถานะ Draft สำหรับรูปภาพ
  const [avatarUriDraft, setAvatarUriDraft] = useState<string | null>(profile.avatarUri ?? null);
  const [coverUriDraft, setCoverUriDraft] = useState<string | null>(profile.coverUri ?? null);

  // สถานะ Draft สำหรับข้อมูลข้อความ
  const [displayNameDraft, setDisplayNameDraft] = useState(profile.displayName);
  const [handleDraft, setHandleDraft] = useState(stripHandle(profile.handle));
  const [bioDraft, setBioDraft] = useState(profile.bio);
  const [websiteUrlDraft, setWebsiteUrlDraft] = useState(profile.websiteUrl ?? '');

  const [isSaving, setIsSaving] = useState(false);

  // อัปเดต draft จาก useLoyaltyStore เมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    setAvatarUriDraft(profile.avatarUri ?? null);
    setCoverUriDraft(profile.coverUri ?? null);
    setDisplayNameDraft(profile.displayName);
    setHandleDraft(stripHandle(profile.handle));
    setBioDraft(profile.bio);
    setWebsiteUrlDraft(profile.websiteUrl ?? '');
  }, [profile]);

  // รับค่าที่ส่งกลับมาจาก EditProfileFieldScreen
  const params = useLocalSearchParams();
  useFocusEffect(
    React.useCallback(() => {
      if (params.field && params.value) {
        const field = params.field as ProfileEditField;
        const value = params.value as string;
        if (field === 'name') setDisplayNameDraft(value);
        else if (field === 'username') setHandleDraft(value);
        else if (field === 'bio') setBioDraft(value);
        else if (field === 'link') setWebsiteUrlDraft(value);
      }
    }, [params])
  );

  const username = formatHandle(profile.handle);

  const copyUsername = async () => {
    await Clipboard.setStringAsync(username);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handlePickAvatar = async () => {
    const uri = await pickProfileAvatar();
    if (uri) {
      setAvatarUriDraft(uri);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handlePickCover = async () => {
    const uri = await pickProfileCover();
    if (uri) {
      setCoverUriDraft(uri);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // ตรวจสอบว่ามีการเปลี่ยนแปลงใดๆ หรือไม่
  const isDirty =
    avatarUriDraft !== profile.avatarUri ||
    coverUriDraft !== profile.coverUri ||
    displayNameDraft !== profile.displayName ||
    handleDraft !== stripHandle(profile.handle) ||
    bioDraft !== profile.bio ||
    websiteUrlDraft !== (profile.websiteUrl ?? '');

  const canSave = isDirty && !isSaving;

  const saveAllProfileChanges = async () => {
    if (!canSave) return;
    setIsSaving(true);

    try {
      // บันทึกรูปโปรไฟล์ (Avatar)
      if (avatarUriDraft && avatarUriDraft !== profile.avatarUri) {
        await saveProfilePhoto('avatar', avatarUriDraft);
      }
      // บันทึกรูปภาพหน้าปก (Cover Photo)
      if (coverUriDraft && coverUriDraft !== profile.coverUri) {
        await saveProfilePhoto('cover', coverUriDraft);
      }

      // บันทึกข้อมูลข้อความ
      const updates: Record<string, any> = {};
      const localUpdates: Record<string, any> = {};

      if (displayNameDraft !== profile.displayName) {
        const nextDisplayName = displayNameDraft.trim();
        if (!nextDisplayName) {
          Alert.alert('ชื่อไม่ถูกต้อง', 'กรุณาใส่ชื่อโปรไฟล์');
          return;
        }
        updates.displayName = nextDisplayName;
        localUpdates.displayName = nextDisplayName;
        localUpdates.displayNameChangedAt = new Date().toISOString();
      }

      if (handleDraft !== stripHandle(profile.handle)) {
        const lockedUntil = cooldownUntil(profile.handleChangedAt);
        if (lockedUntil) {
          Alert.alert(
            'เปลี่ยนชื่อผู้ใช้งานไม่ได้',
            `คุณสามารถเปลี่ยนชื่อผู้ใช้งานได้อีกครั้งในวันที่ ${formatCooldownDate(lockedUntil)}`
          );
          return;
        }
        const formattedHandle = formatHandle(handleDraft);
        if (formattedHandle.length < 2) {
          Alert.alert('ชื่อผู้ใช้งานไม่ถูกต้อง', 'กรุณาใส่ตัวอักษรหรือตัวเลขอย่างน้อย 1 ตัว');
          return;
        }
        updates.handle = formattedHandle;
        localUpdates.handle = formattedHandle;
        localUpdates.handleChangedAt = new Date().toISOString();
      }

      if (bioDraft !== profile.bio) {
        updates.bio = bioDraft;
        localUpdates.bio = bioDraft;
      }

      if (websiteUrlDraft !== (profile.websiteUrl ?? '')) {
        updates.websiteUrl = normalizeWebsite(websiteUrlDraft);
        localUpdates.websiteUrl = normalizeWebsite(websiteUrlDraft);
      }

      if (Object.keys(updates).length > 0) {
        await apiUpsertProfile(updates);
        updateProfile(localUpdates); // อัปเดต zustand store
        if (typeof localUpdates.displayName === 'string') renameOwnPosts(localUpdates.displayName);
        const auth = useAuthStore.getState();
        if (auth.user && auth.sessionToken) {
          await auth.setSession({
            sessionToken: auth.sessionToken,
            user: {
              ...auth.user,
              ...(typeof localUpdates.displayName === 'string' ? { displayName: localUpdates.displayName } : {}),
              ...(typeof localUpdates.handle === 'string' ? { handle: localUpdates.handle } : {}),
            },
          });
        }
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      Alert.alert(
        'บันทึกโปรไฟล์ไม่สำเร็จ',
        error instanceof Error ? error.message : 'ไม่สามารถบันทึกการเปลี่ยนแปลงโปรไฟล์ได้',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
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
        <Pressable
          onPress={saveAllProfileChanges}
          disabled={!canSave}
          hitSlop={10}
          accessibilityLabel="บันทึก"
        >
          <Text style={[styles.saveButton, !canSave && styles.saveButtonOff]}>บันทึก</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <Pressable
            style={styles.coverBanner}
            onPress={() => void handlePickCover()}
            accessibilityLabel="เปลี่ยนรูปปก"
            accessibilityHint="แตะที่รูปปกหรือไอคอนกล้องเพื่อเปลี่ยนรูปปก"
          >
            {coverUriDraft ? (
              <Image source={{ uri: coverUriDraft }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <LinearGradient
                colors={[colors.brand.forest, colors.brand.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
          </Pressable>

          <Pressable
            style={styles.coverCamBtn}
            onPress={() => void handlePickCover()}
            hitSlop={8}
            accessibilityLabel="เปลี่ยนรูปปก"
          >
            <Ionicons name="camera" size={18} color={colors.text.primary} />
          </Pressable>

          <View style={styles.identityRow} pointerEvents="box-none">
            <Pressable
              style={styles.avatarHit}
              onPress={() => void handlePickAvatar()}
              accessibilityLabel="เปลี่ยนรูปโปรไฟล์"
              accessibilityHint="แตะที่รูปโปรไฟล์หรือไอคอนกล้องเพื่อเปลี่ยนรูป"
            >
              <Avatar
                uri={avatarUriDraft}
                initial={displayNameDraft.slice(0, 1)}
                size={108}
                radius={54}
                borderWidth={3}
                borderColor="#fff"
              />
              <View style={styles.avatarCamBtn}>
                <Ionicons name="camera" size={14} color={colors.text.primary} />
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.formSection}>
        <View style={styles.card}>
          <Row
            label="ชื่อ"
            value={displayNameDraft}
            onPress={() => openField('name')}
          />
          <Row
            label="ชื่อผู้ใช้งาน"
            value={handleDraft}
            onPress={() => openField('username')}
          />
          <Pressable style={styles.row} onPress={() => void copyUsername()}>
            <Text style={styles.linkText} numberOfLines={1}>
              {username}
            </Text>
            <Ionicons name="copy-outline" size={18} color={colors.text.muted} />
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>ข้อมูลพื้นฐาน</Text>
        <View style={styles.card}>
          <Row
            label="ประวัติ"
            value={bioDraft.trim() || 'เขียนคำอธิบายสั้น ๆ ว่าคุณเป็นใคร หรือบัญชีของคุณเกี่ยวข้องกับอะไร'}
            placeholder={!bioDraft.trim()}
            onPress={() => openField('bio')}
          />
          <Row
            label="ลิงก์"
            value={websiteUrlDraft.trim() || 'เพิ่มลิงก์'}
            placeholder={!websiteUrlDraft.trim()}
            onPress={() => openField('link')}
            last
          />
        </View>
        <Text style={styles.sectionLabel}>การแนะนำเฉพาะคุณ</Text>
        <View style={styles.card}>
          <Row label="ความสนใจ" value="Tag อาชีพ ทักษะ และหมวด" onPress={() => router.push('/profile/interests' as never)} last />
        </View>
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
  root: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: '#fff',
    justifyContent: 'space-between',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: colors.text.primary,
  },
  saveButton: {
    fontSize: 17,
    fontWeight: '800',
    color: PINK,
    paddingHorizontal: 8,
  },
  saveButtonOff: {
    color: '#FFB3C2',
  },
  headerBlock: {
    position: 'relative',
    backgroundColor: '#fff',
  },
  coverBanner: {
    width: '100%',
    height: PROFILE_COVER_HEIGHT,
    backgroundColor: colors.brand.forest,
    overflow: 'hidden',
  },
  coverCamBtn: {
    position: 'absolute',
    right: 16,
    top: PROFILE_COVER_HEIGHT - 16 - 36,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    zIndex: 4,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: -52,
    paddingHorizontal: 16,
    zIndex: 8,
    elevation: 8,
  },
  avatarHit: {
    width: 108,
    height: 108,
  },
  avatarCamBtn: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  formSection: {
    backgroundColor: PAGE_BG,
    paddingTop: 14,
    flex: 1,
  },
  sectionLabel: {
    marginTop: 4,
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
