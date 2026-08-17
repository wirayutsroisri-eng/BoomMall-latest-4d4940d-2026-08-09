import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Avatar } from '@/shared/components/Avatar';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import type { Conversation } from '@/modules/chat/domain/types';

export type GroupMemberPick = {
  name: string;
  handle: string;
};

type Props = {
  visible: boolean;
  contacts: Conversation[];
  onClose: () => void;
  onCreate: (name: string, members: GroupMemberPick[]) => void;
};

/**
 * Create-group sheet — real TextInput (Alert.prompt cannot type after the + menu Modal).
 * Flow: name the group → pick friends → create → parent opens the thread.
 */
export function CreateGroupSheet({ visible, contacts, onClose, onCreate }: Props) {
  const inputRef = useRef<TextInput>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setName('');
    setSelected(new Set());
    const t = setTimeout(() => inputRef.current?.focus(), 380);
    return () => clearTimeout(t);
  }, [visible]);

  const toggle = (id: string) => {
    void Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const members = contacts
      .filter((c) => selected.has(c.id))
      .map((c) => ({
        name: c.peerName,
        handle: (c.peerHandle ?? '').replace(/^@/, '') || c.id,
      }));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
    onCreate(trimmed, members);
  };

  const canCreate = name.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <DragDownDismiss
        onDismiss={onClose}
        showDim
        rootInModal
        style={styles.wrap}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="ปิด" />
          <View style={styles.card}>
            <Text style={styles.title}>สร้างกลุ่มใหม่</Text>
            <Text style={styles.sub}>ตั้งชื่อกลุ่มแชทของคุณ (Group Chat)</Text>

            <TextInput
              ref={inputRef}
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="ชื่อกลุ่ม"
              placeholderTextColor="rgba(60,60,67,0.45)"
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={submit}
              blurOnSubmit={false}
            />

            <Text style={styles.section}>เชิญเพื่อนเข้ากลุ่ม</Text>
            {contacts.length === 0 ? (
              <Text style={styles.empty}>ยังไม่มีเพื่อนในรายการ — สร้างกลุ่มได้เลย แล้วเชิญทีหลัง</Text>
            ) : (
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {contacts.map((c) => {
                  const on = selected.has(c.id);
                  return (
                    <Pressable key={c.id} style={styles.row} onPress={() => toggle(c.id)}>
                      <Avatar
                        uri={c.avatarUri}
                        initial={c.peerName.slice(0, 1)}
                        backgroundColor={c.avatarColor}
                        size={36}
                        radius={12}
                        borderWidth={0}
                      />
                      <Text style={styles.rowName} numberOfLines={1}>
                        {c.peerName}
                      </Text>
                      <Ionicons
                        name={on ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={on ? colors.brand.primaryDark : 'rgba(60,60,67,0.35)'}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.actions}>
              <Pressable style={styles.btn} onPress={onClose}>
                <Text style={styles.btnText}>ยกเลิก</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnPrimary, !canCreate && styles.btnOff]}
                onPress={submit}
                disabled={!canCreate}
              >
                <Text style={[styles.btnText, styles.btnPrimaryText]}>สร้าง</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </DragDownDismiss>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'center' },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    maxHeight: '78%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#000',
  },
  sub: {
    marginTop: 4,
    fontSize: 13,
    color: 'rgba(60,60,67,0.72)',
  },
  input: {
    marginTop: 14,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    backgroundColor: '#E5E5EA',
    fontSize: 16,
    color: '#000',
  },
  section: {
    marginTop: 16,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(60,60,67,0.64)',
  },
  empty: {
    fontSize: 13,
    color: 'rgba(60,60,67,0.55)',
    marginBottom: 8,
  },
  list: {
    maxHeight: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#000',
  },
  btnOff: {
    opacity: 0.35,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  btnPrimaryText: {
    color: '#FFF',
  },
});
