import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import {
  REPORT_REASONS,
  useModerationStore,
  type ReportTargetKind,
} from '@/modules/safety/state/moderation-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';

type Props = {
  visible: boolean;
  onClose: () => void;
  kind: ReportTargetKind;
  targetId: string;
  targetLabel?: string;
  /** When set, offers Block after report */
  blockUserId?: string;
};

export function ReportBlockSheet({
  visible,
  onClose,
  kind,
  targetId,
  targetLabel,
  blockUserId,
}: Props) {
  const submitReport = useModerationStore((s) => s.submitReport);
  const blockUser = useModerationStore((s) => s.blockUser);
  const authUser = useAuthStore((s) => s.user);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');

  const onSubmit = () => {
    submitReport({
      kind,
      targetId,
      targetLabel,
      reason,
      details: details.trim() || undefined,
    });
    void import('@/modules/safety/syncModerationContentBlocks').then(({ submitReportToServer }) =>
      submitReportToServer({
        kind,
        targetId,
        targetLabel,
        reason,
        details: details.trim() || undefined,
        reporterRef: authUser?.id ?? 'mobile-anon',
      }),
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const finish = () => {
      setDetails('');
      onClose();
    };

    if (blockUserId) {
      Alert.alert('ส่งรายงานแล้ว', 'ทีม moderation จะตรวจสอบตามคิว', [
        { text: 'ปิด', style: 'cancel', onPress: finish },
        {
          text: 'บล็อกผู้ใช้นี้',
          style: 'destructive',
          onPress: () => {
            blockUser(blockUserId);
            Alert.alert('บล็อกแล้ว', 'จะไม่แสดงคอนเทนต์จากผู้ใช้นี้');
            finish();
          },
        },
      ]);
      return;
    }

    Alert.alert('ส่งรายงานแล้ว', 'ทีม moderation จะตรวจสอบตามคิว', [
      { text: 'ตกลง', onPress: finish },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <DragDownDismiss onDismiss={onClose} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>รายงานเนื้อหา</Text>
            {targetLabel ? (
              <Text style={styles.sub} numberOfLines={2}>
                {targetLabel}
              </Text>
            ) : null}

            <Text style={styles.label}>เหตุผล</Text>
            <View style={styles.reasonWrap}>
              {REPORT_REASONS.map((r) => (
                <Pressable
                  key={r}
                  style={[styles.reasonChip, reason === r && styles.reasonChipOn]}
                  onPress={() => setReason(r)}
                >
                  <Text style={[styles.reasonText, reason === r && styles.reasonTextOn]}>{r}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>รายละเอียด (ไม่บังคับ)</Text>
            <TextInput
              style={styles.input}
              value={details}
              onChangeText={setDetails}
              placeholder="อธิบายเพิ่มเติม"
              placeholderTextColor={colors.text.muted}
              multiline
            />

            <Pressable style={styles.submit} onPress={onSubmit}>
              <Text style={styles.submitText}>ส่งรายงาน</Text>
            </Pressable>
          </DragDownDismiss>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    marginBottom: 4,
  },
  title: { fontWeight: '900', fontSize: 18, color: colors.text.primary },
  sub: { color: colors.text.secondary, fontSize: 13 },
  label: { fontWeight: '700', color: colors.text.primary, marginTop: 4 },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface.canvas,
  },
  reasonChipOn: { backgroundColor: colors.brand.primary },
  reasonText: { fontSize: 13, fontWeight: '600', color: colors.text.primary },
  reasonTextOn: { color: colors.brand.ink },
  input: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
    textAlignVertical: 'top',
    color: colors.text.primary,
  },
  submit: {
    marginTop: 6,
    backgroundColor: '#FE2C55',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
