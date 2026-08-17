import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';

const WECHAT_GREEN = '#07C160';

const DAY_NAMES = [
  'วันอาทิตย์',
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
] as const;

type PresetKey = '1h' | '1d' | '1w' | '1m';

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: '1h', label: '1 ชั่วโมงหลังจากนี้' },
  { key: '1d', label: '1 วันหลังจากนี้' },
  { key: '1w', label: '1 สัปดาห์หลังจากนี้' },
  { key: '1m', label: '1 เดือนหลังจากนี้' },
];

type Props = {
  visible: boolean;
  alreadySet?: boolean;
  initialAt?: string | null;
  onClose: () => void;
  onConfirm: (when: Date) => void;
  onClear?: () => void;
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function applyPreset(key: PresetKey): Date {
  const next = new Date();
  if (key === '1h') next.setHours(next.getHours() + 1);
  if (key === '1d') next.setDate(next.getDate() + 1);
  if (key === '1w') next.setDate(next.getDate() + 7);
  if (key === '1m') next.setMonth(next.getMonth() + 1);
  next.setSeconds(0, 0);
  return next;
}

function matchingPreset(when: Date): PresetKey | null {
  for (const p of PRESETS) {
    if (Math.abs(applyPreset(p.key).getTime() - when.getTime()) < 90_000) return p.key;
  }
  return null;
}

export function formatReminderWhen(when: Date): string {
  const now = new Date();
  const day = DAY_NAMES[when.getDay()];
  const hh = when.getHours().toString().padStart(2, '0');
  const mm = when.getMinutes().toString().padStart(2, '0');
  const time = `${hh}:${mm}`;
  const diffDays = Math.round((startOfDay(when) - startOfDay(now)) / 86_400_000);
  if (diffDays === 0) return `${day} วันนี้ ${time}`;
  if (diffDays === 1) return `${day} พรุ่งนี้ ${time}`;
  return `${day} ${when.getDate()}/${when.getMonth() + 1} ${time}`;
}

function buildDays(from: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Array.from({ length: 60 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * WeChat-style message reminder — pick a time, then the OS fires a real local notification.
 */
export function ReminderSheet({
  visible,
  alreadySet,
  initialAt,
  onClose,
  onConfirm,
  onClear,
}: Props) {
  const [when, setWhen] = useState(() => applyPreset('1h'));
  const [preset, setPreset] = useState<PresetKey | null>('1h');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const initial = initialAt ? new Date(initialAt) : applyPreset('1h');
    const valid = initial.getTime() > Date.now() + 5000 ? initial : applyPreset('1h');
    setWhen(valid);
    setPreset(matchingPreset(valid) ?? (initialAt ? null : '1h'));
    setPickerOpen(false);
  }, [visible, initialAt]);

  const days = useMemo(() => buildDays(new Date()), [visible]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const selectPreset = (key: PresetKey) => {
    void Haptics.selectionAsync();
    setPreset(key);
    setWhen(applyPreset(key));
    setPickerOpen(false);
  };

  const patchWhen = (next: Date) => {
    setWhen(next);
    setPreset(matchingPreset(next));
  };

  const confirm = () => {
    if (when.getTime() <= Date.now() + 5000) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(when);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <DragDownDismiss onDismiss={onClose} showDim rootInModal style={styles.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="ปิด" />
        <View style={styles.card} pointerEvents="box-none">
          <Text style={styles.title}>ตั้งเวลาการแจ้งเตือน</Text>

          <Pressable
            style={styles.whenField}
            onPress={() => {
              void Haptics.selectionAsync();
              setPickerOpen((v) => !v);
            }}
            accessibilityLabel="เลือกวันเวลา"
          >
            <Text style={styles.whenText}>{formatReminderWhen(when)}</Text>
            <Ionicons
              name={pickerOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#B0B0B0"
            />
          </Pressable>

          {pickerOpen ? (
            <View style={styles.wheels}>
              <Wheel
                values={days.map((d, i) =>
                  i === 0 ? 'วันนี้' : i === 1 ? 'พรุ่งนี้' : `${d.getDate()}/${d.getMonth() + 1}`,
                )}
                index={Math.max(
                  0,
                  days.findIndex(
                    (d) =>
                      d.getFullYear() === when.getFullYear() &&
                      d.getMonth() === when.getMonth() &&
                      d.getDate() === when.getDate(),
                  ),
                )}
                onChange={(index) => {
                  const day = days[index];
                  if (!day) return;
                  const next = new Date(when);
                  next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
                  patchWhen(next);
                }}
              />
              <Wheel
                values={hours.map((h) => h.toString().padStart(2, '0'))}
                index={when.getHours()}
                onChange={(index) => {
                  const next = new Date(when);
                  next.setHours(index, when.getMinutes(), 0, 0);
                  patchWhen(next);
                }}
              />
              <Wheel
                values={minutes.map((m) => m.toString().padStart(2, '0'))}
                index={when.getMinutes()}
                onChange={(index) => {
                  const next = new Date(when);
                  next.setMinutes(index, 0, 0);
                  patchWhen(next);
                }}
              />
            </View>
          ) : null}

          <View style={styles.chipRow}>
            {PRESETS.map((p) => {
              const on = preset === p.key;
              return (
                <Pressable
                  key={p.key}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => selectPreset(p.key)}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={2}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {alreadySet && onClear ? (
            <Pressable
              onPress={() => {
                Alert.alert('ลบการแจ้งเตือน?', 'จะไม่เตือนข้อความนี้แล้ว', [
                  { text: 'ยกเลิก', style: 'cancel' },
                  {
                    text: 'ลบ',
                    style: 'destructive',
                    onPress: () => {
                      void Haptics.selectionAsync();
                      onClear();
                    },
                  },
                ]);
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearText}>ลบการแจ้งเตือน</Text>
            </Pressable>
          ) : null}

          <View style={styles.footer}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </Pressable>
            <Pressable style={styles.okBtn} onPress={confirm}>
              <Text style={styles.okText}>การตั้งค่า</Text>
            </Pressable>
          </View>
        </View>
      </DragDownDismiss>
    </Modal>
  );
}

function Wheel({
  values,
  index,
  onChange,
}: {
  values: string[];
  index: number;
  onChange: (index: number) => void;
}) {
  return (
    <ScrollView
      style={styles.wheel}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      {values.map((label, i) => {
        const on = i === index;
        return (
          <Pressable
            key={`${label}-${i}`}
            style={styles.wheelItem}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(i);
            }}
          >
            <Text style={[styles.wheelText, on && styles.wheelTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 16,
  },
  whenField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E6E6E6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF',
  },
  whenText: { fontSize: 15, fontWeight: '600', color: '#222', flex: 1, marginRight: 8 },
  wheels: {
    flexDirection: 'row',
    height: 140,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#EEE',
    borderRadius: 8,
    overflow: 'hidden',
  },
  wheel: { flex: 1 },
  wheelItem: { height: 36, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontSize: 14, color: '#999', fontWeight: '600' },
  wheelTextOn: { color: '#111', fontWeight: '800' },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  chipOn: { borderColor: WECHAT_GREEN },
  chipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  chipTextOn: { color: '#111' },
  clearBtn: { alignSelf: 'center', marginTop: 12, paddingVertical: 4 },
  clearText: { color: '#E54D42', fontWeight: '700', fontSize: 13 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '700', color: '#333' },
  okBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: WECHAT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
});
