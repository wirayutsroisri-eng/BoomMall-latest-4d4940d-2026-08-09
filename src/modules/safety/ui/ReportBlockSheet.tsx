import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  const insets = useSafeAreaInsets();
  const submitReport = useModerationStore((s) => s.submitReport);
  const blockUser = useModerationStore((s) => s.blockUser);
  const authUser = useAuthStore((s) => s.user);
  const [otherOpen, setOtherOpen] = useState(false);
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (!visible) {
      setOtherOpen(false);
      setDetails('');
    }
  }, [visible]);

  const finishSubmit = (reason: string, extra?: string) => {
    submitReport({
      kind,
      targetId,
      targetLabel,
      reason,
      details: extra?.trim() || undefined,
    });
    void import('@/modules/safety/syncModerationContentBlocks').then(({ submitReportToServer }) =>
      submitReportToServer({
        kind,
        targetId,
        targetLabel,
        reason,
        details: extra?.trim() || undefined,
        reporterRef: authUser?.id ?? 'mobile-anon',
      }),
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const finish = () => {
      setDetails('');
      setOtherOpen(false);
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

  const pickReason = (reason: string) => {
    void Haptics.selectionAsync();
    if (reason === 'อื่นๆ') {
      setOtherOpen(true);
      return;
    }
    finishSubmit(reason);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <DragDownDismiss onDismiss={onClose} showDim rootInModal rootStyle={styles.dismissRoot}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />
          <Text style={styles.navTitle}>รายงาน</Text>
          {otherOpen ? (
            <>
              <Pressable style={styles.backRow} onPress={() => setOtherOpen(false)} hitSlop={8}>
                <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
                <Text style={styles.backText}>กลับ</Text>
              </Pressable>
              <Text style={styles.heading}>อธิบายเพิ่มเติม</Text>
              <Text style={styles.sub}>
                บอกทีมตรวจสอบว่าเกิดอะไรขึ้น ข้อมูลนี้ส่งเข้าคิว moderation จริง
              </Text>
              <TextInput
                style={styles.input}
                value={details}
                onChangeText={setDetails}
                placeholder="รายละเอียด (ไม่บังคับ)"
                placeholderTextColor={colors.text.muted}
                multiline
              />
              <Pressable style={styles.submit} onPress={() => finishSubmit('อื่นๆ', details)}>
                <Text style={styles.submitText}>ส่งรายงาน</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.heading}>
                {kind === 'content'
                  ? 'เหตุใดคุณจึงรายงานรูปภาพนี้'
                  : kind === 'comment'
                    ? 'เหตุใดคุณจึงรายงานความคิดเห็นนี้'
                    : 'เหตุใดคุณจึงรายงานเนื้อหานี้'}
              </Text>
              <Text style={styles.sub}>
                {targetLabel
                  ? `${targetLabel}\nรายงานจะถูกส่งให้ทีมตรวจสอบ ไม่ได้แชร์กับเจ้าของโพสต์`
                  : 'รายงานจะถูกส่งให้ทีมตรวจสอบ ไม่ได้แชร์กับเจ้าของโพสต์'}
              </Text>
              <View style={styles.list}>
                {REPORT_REASONS.map((reason, index) => (
                  <Pressable
                    key={reason}
                    style={[styles.reasonRow, index === REPORT_REASONS.length - 1 && styles.reasonLast]}
                    onPress={() => pickReason(reason)}
                  >
                    <Text style={styles.reasonLabel}>{reason}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      </DragDownDismiss>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dismissRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 10,
  },
  navTitle: {
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 16,
    color: colors.text.primary,
    marginBottom: 14,
  },
  heading: {
    fontWeight: '800',
    fontSize: 20,
    color: colors.text.primary,
    marginBottom: 8,
  },
  sub: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 12,
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  reasonRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  reasonLast: { borderBottomWidth: 0 },
  reasonLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text.primary },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  backText: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  input: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
    textAlignVertical: 'top',
    color: colors.text.primary,
    marginBottom: 12,
  },
  submit: {
    backgroundColor: '#FE2C55',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
