import React from 'react';
import { Dimensions, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import type { ProfilePhotoKind } from '../state/avatar-photo-store';

type Props = {
  kind: ProfilePhotoKind;
  uri?: string | null;
  initial?: string;
  onChangePhoto: () => void;
  onClose: () => void;
};

const AVATAR_SIZE = 280;
const COVER_W = Dimensions.get('window').width - 40;
const COVER_H = Math.round(COVER_W * 0.42);

/** Long-press → ดูรูปเดิมแบบเต็มจอ แล้วค่อยกดเปลี่ยนรูปภาพ */
export function AvatarPhotoPreview({
  kind,
  uri,
  initial = '?',
  onChangePhoto,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const isCover = kind === 'cover';

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <DragDownDismiss onDismiss={onClose} rootInModal style={styles.sheet}>
          <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
            <Pressable style={styles.iconBtn} onPress={onClose} hitSlop={8} accessibilityLabel="ปิด">
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Text style={styles.title}>{isCover ? 'รูปปก' : 'รูปโปรไฟล์'}</Text>
            <View style={styles.iconBtn} />
          </View>

          <View style={styles.stage}>
            {isCover ? (
              <View style={styles.coverFrame}>
                {uri ? (
                  <Image source={{ uri }} style={styles.coverPhoto} resizeMode="cover" />
                ) : (
                  <LinearGradient
                    colors={[colors.brand.forest, colors.brand.primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.coverPhoto}
                  />
                )}
              </View>
            ) : (
              <View style={styles.circle}>
                {uri ? (
                  <Image source={{ uri }} style={styles.avatarPhoto} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatarPhoto, styles.placeholder]}>
                    <Text style={styles.initial}>{initial}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable style={styles.changeBtn} onPress={onChangePhoto}>
              <Ionicons name="images-outline" size={20} color="#fff" />
              <Text style={styles.changeText}>เปลี่ยนรูปภาพ</Text>
            </Pressable>
          </View>
        </DragDownDismiss>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#0B1F17',
  },
  sheet: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  circle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#1a2a22',
  },
  avatarPhoto: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  coverFrame: {
    width: COVER_W,
    height: COVER_H,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a2a22',
  },
  coverPhoto: { width: COVER_W, height: COVER_H },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontSize: 96, fontWeight: '900' },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
  changeBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  changeText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
