import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MusicLibraryTab } from './MusicLibrarySidebar';
import { colors } from '@/shared/theme/colors';

export type YoutubeMenuAction =
  | { type: 'use' }
  | { type: 'pin' }
  | { type: 'load' }
  | { type: 'delete' }
  | { type: 'showLibrary'; tab: MusicLibraryTab };

type ModeRow = {
  tab: MusicLibraryTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const LIBRARY_MODES: ModeRow[] = [
  { tab: 'all', label: 'ทั้งหมด', icon: 'musical-notes-outline' },
  { tab: 'pinned', label: 'ปักหมุด', icon: 'pin-outline' },
  { tab: 'frequent', label: 'เล่นบ่อย', icon: 'flame-outline' },
  { tab: 'history', label: 'ประวัติ', icon: 'time-outline' },
];

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  /** When set, show per-track actions (use / pin / load / delete) */
  trackActions?: {
    pinned: boolean;
    loaded: boolean;
  } | null;
  activeLibraryTab: MusicLibraryTab;
  onClose: () => void;
  onAction: (action: YoutubeMenuAction) => void;
};

type Row = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  check?: boolean;
  onPress: () => void;
};

/**
 * YouTube-style floating action menu (white card, icon + label rows).
 * Used for long-press / ⋮ on queue rows and settings gear.
 */
export function MusicYoutubeMenu({
  visible,
  title,
  subtitle,
  trackActions,
  activeLibraryTab,
  onClose,
  onAction,
}: Props) {
  const insets = useSafeAreaInsets();

  const rows: Row[] = [];

  if (trackActions) {
    rows.push(
      {
        key: 'use',
        label: 'ใช้เสียงนี้',
        icon: 'musical-note-outline',
        onPress: () => onAction({ type: 'use' }),
      },
      {
        key: 'pin',
        label: trackActions.pinned ? 'เลิกปักหมุด' : 'ปักหมุด',
        icon: trackActions.pinned ? 'pin' : 'pin-outline',
        onPress: () => onAction({ type: 'pin' }),
      },
      {
        key: 'load',
        label: trackActions.loaded ? 'ในคลังแล้ว' : 'โหลดเข้าคลัง',
        icon: trackActions.loaded ? 'checkmark-circle-outline' : 'download-outline',
        onPress: () => onAction({ type: 'load' }),
      },
    );
  }

  for (const mode of LIBRARY_MODES) {
    rows.push({
      key: `mode-${mode.tab}`,
      label: `แสดงรายการ · ${mode.label}`,
      icon: mode.icon,
      check: activeLibraryTab === mode.tab,
      onPress: () => onAction({ type: 'showLibrary', tab: mode.tab }),
    });
  }

  if (trackActions) {
    rows.push({
      key: 'delete',
      label: 'ลบเพลง',
      icon: 'trash-outline',
      destructive: true,
      onPress: () => onAction({ type: 'delete' }),
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.card, { marginBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {title ? (
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}

          {trackActions ? <Text style={styles.sectionLabel}>จัดการเพลง</Text> : null}
          {trackActions
            ? rows
                .filter((r) => ['use', 'pin', 'load'].includes(r.key))
                .map((row) => <MenuRow key={row.key} row={row} onClose={onClose} />)
            : null}

          <Text style={[styles.sectionLabel, trackActions ? styles.sectionSpaced : null]}>
            โหมดรายการเพลง
          </Text>
          {rows
            .filter((r) => r.key.startsWith('mode-'))
            .map((row) => (
              <MenuRow key={row.key} row={row} onClose={onClose} />
            ))}

          {trackActions ? (
            <>
              <View style={styles.divider} />
              {rows
                .filter((r) => r.key === 'delete')
                .map((row) => (
                  <MenuRow key={row.key} row={row} onClose={onClose} />
                ))}
            </>
          ) : null}

          <Pressable
            style={styles.cancelBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="ปิด"
          >
            <Text style={styles.cancelText}>ปิด</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function MenuRow({ row, onClose }: { row: Row; onClose: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => {
        row.onPress();
        onClose();
      }}
      accessibilityRole="button"
      accessibilityLabel={row.label}
    >
      <Ionicons
        name={row.icon}
        size={22}
        color={row.destructive ? '#C62828' : '#0F0F0F'}
        style={styles.rowIcon}
      />
      <Text style={[styles.rowLabel, row.destructive && styles.rowLabelDanger]} numberOfLines={1}>
        {row.label}
      </Text>
      {row.check ? (
        <Ionicons name="checkmark" size={20} color={colors.brand.primaryDark} />
      ) : (
        <View style={styles.checkSpacer} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingTop: 10,
    paddingBottom: 6,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F0F0F',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sectionSpaced: { marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 14,
  },
  rowPressed: { backgroundColor: '#F3F4F6' },
  rowIcon: { width: 26, textAlign: 'center' },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F0F0F',
  },
  rowLabelDanger: { color: '#C62828' },
  checkSpacer: { width: 20 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
    marginHorizontal: 12,
  },
  cancelBtn: {
    marginTop: 2,
    marginHorizontal: 10,
    marginBottom: 4,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F0F0F',
  },
});
