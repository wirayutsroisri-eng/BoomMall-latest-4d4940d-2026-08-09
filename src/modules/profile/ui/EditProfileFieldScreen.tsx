import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
// import { useFeedStore } from '@/modules/feed/state/feed-store'; // ไม่ใช้แล้ว
// import { useAuthStore } from '@/modules/auth/state/auth-store'; // ไม่ใช้แล้ว
// import { apiUpsertProfile } from '@/modules/social/data/socialApi'; // ไม่ใช้แล้ว
import { FormTextInput } from '@/shared/components/FormTextInput';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import {
  PROFILE_FIELD_LIMITS,
  cooldownUntil,
  formatCooldownDate,
  formatHandle,
  normalizeWebsite,
  stripHandle,
  type ProfileEditField,
} from '../domain/edit-profile';

const PINK = '#FE2C55';
const INPUT_BG = '#F2F2F7';

const COPY: Record<
  ProfileEditField,
  { title: string; hint: string; placeholder: string; cooldownKey?: 'displayNameChangedAt' | 'handleChangedAt' }
> = {
  name: {
    title: 'ชื่อ',
    hint: 'คุณสามารถเปลี่ยนชื่อได้เพียงครั้งเดียวทุก ๆ 7 วัน',
    placeholder: 'ชื่อที่แสดง',
    cooldownKey: 'displayNameChangedAt',
  },
  username: {
    title: 'ชื่อผู้ใช้งาน',
    hint: 'คุณสามารถเปลี่ยนชื่อผู้ใช้งานได้เพียงครั้งเดียวทุก ๆ 7 วัน',
    placeholder: 'username',
    cooldownKey: 'handleChangedAt',
  },
  bio: {
    title: 'ประวัติ',
    hint: 'เขียนคำอธิบายสั้น ๆ ว่าคุณเป็นใคร หรือบัญชีของคุณเกี่ยวข้องกับอะไร',
    placeholder: 'เพิ่มประวัติ',
  },
  link: {
    title: 'ลิงก์',
    hint: 'เพิ่มเว็บไซต์หรือลิงก์โซเชียลที่ต้องการแสดงบนโปรไฟล์',
    placeholder: 'https://',
  },
};

function isField(value: string | undefined): value is ProfileEditField {
  return value === 'name' || value === 'username' || value === 'bio' || value === 'link';
}

export function EditProfileFieldScreen() {
  const insets = useSafeAreaInsets();
  const { field: fieldParam } = useLocalSearchParams<{ field?: string }>();
  const field: ProfileEditField = isField(fieldParam) ? fieldParam : 'name';
  const copy = COPY[field];
  const limit = PROFILE_FIELD_LIMITS[field];

  const profile = useLoyaltyStore((s) => s.profile);
  // ลบ updateProfile และ renameOwnPosts, useAuthStore, apiUpsertProfile ออกจากไฟล์นี้
  // const updateProfile = useLoyaltyStore((s) => s.updateProfile);
  // const renameOwnPosts = useFeedStore((s) => s.renameOwnPosts);
  // const useAuthStore = useAuthStore((s) => s); // ไม่ได้ใช้ตรงๆ

  const initial = useMemo(() => {
    if (field === 'name') return profile.displayName;
    if (field === 'username') return stripHandle(profile.handle);
    if (field === 'bio') return profile.bio;
    return profile.websiteUrl ?? '';
  }, [field, profile.bio, profile.displayName, profile.handle, profile.websiteUrl]);

  const [value, setValue] = useState(initial);
  const lockedUntil = copy.cooldownKey ? cooldownUntil(profile[copy.cooldownKey]) : null;
  const locked = Boolean(lockedUntil);
  const dirty = value.trim() !== initial.trim();
  const canSave = dirty && !locked && (field === 'bio' || field === 'link' || value.trim().length > 0);

  const onChange = (next: string) => {
    if (field === 'username') {
      setValue(stripHandle(formatHandle(next)));
      return;
    }
    setValue(next.slice(0, limit));
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile/edit');
  };

  const save = () => {
    if (!canSave) return;
    const trimmed = value.trim();

    // สำหรับชื่อผู้ใช้งาน ตรวจสอบความยาวขั้นต่ำ
    if (field === 'username') {
      const formattedHandle = formatHandle(trimmed);
      if (formattedHandle.length < 2) {
        Alert.alert('ชื่อผู้ใช้งานไม่ถูกต้อง', 'กรุณาใส่ตัวอักษรหรือตัวเลขอย่างน้อย 1 ตัว');
        return;
      }
    }

    // ส่งค่ากลับไปยัง EditProfileScreen
    router.setParams({ field, value: trimmed });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    close();
  };

  return (
    <DragDownDismiss onDismiss={close} style={styles.root}>
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topBar}>
        <Pressable onPress={close} hitSlop={10} accessibilityLabel="ยกเลิก">
          <Text style={styles.cancel}>ยกเลิก</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={!canSave}
          hitSlop={10}
          accessibilityLabel="บันทึก"
        >
          <Text style={[styles.save, !canSave && styles.saveOff]}>บันทึก</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.hint}>
          {locked && lockedUntil
            ? `เปลี่ยนได้อีกครั้งวันที่ ${formatCooldownDate(lockedUntil)}`
            : copy.hint}
        </Text>

        <View style={[styles.inputWrap, locked && styles.inputLocked]}>
          {field === 'bio' ? (
            <FormTextInput
              value={value}
              onChangeText={onChange}
              placeholder={copy.placeholder}
              placeholderTextColor="#C7C7CC"
              multiline
              maxLength={limit}
              autoFocus
              editable={!locked}
              containerStyle={{ flex: 1 }}
              style={styles.inputMultiline}
            />
          ) : (
            <TextInput
              value={value}
              onChangeText={onChange}
              placeholder={copy.placeholder}
              placeholderTextColor="#C7C7CC"
              maxLength={limit}
              autoFocus
              editable={!locked}
              autoCapitalize={field === 'username' || field === 'link' ? 'none' : 'words'}
              autoCorrect={field === 'name'}
              keyboardType={field === 'link' ? 'url' : 'default'}
              style={styles.input}
              selectionColor={PINK}
            />
          )}
          {value.length > 0 && !locked ? (
            <Pressable
              onPress={() => setValue('')}
              hitSlop={8}
              accessibilityLabel="ล้างข้อความ"
            >
              <Ionicons name="close-circle" size={20} color="#C7C7CC" />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.counter}>
          {value.length}/{limit}
        </Text>
      </View>
    </KeyboardAvoidingView>
    </DragDownDismiss>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancel: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.text.primary,
  },
  save: {
    fontSize: 17,
    fontWeight: '800',
    color: PINK,
  },
  saveOff: {
    color: '#FFB3C2',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.6,
  },
  hint: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.muted,
    fontWeight: '500',
  },
  inputWrap: {
    marginTop: 22,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: INPUT_BG,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputLocked: {
    opacity: 0.55,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
  },
  inputMultiline: {
    flex: 1,
    minHeight: 88,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.primary,
  },
  counter: {
    marginTop: 8,
    alignSelf: 'flex-end',
    fontSize: 13,
    color: '#C7C7CC',
    fontWeight: '600',
  },
});
