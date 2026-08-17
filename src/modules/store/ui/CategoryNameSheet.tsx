import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';

type Props = {
  visible: boolean;
  title: string;
  subtitle: string;
  initialValue?: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
};

export function CategoryNameSheet({
  visible,
  title,
  subtitle,
  initialValue = '',
  onClose,
  onSubmit,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const [name, setName] = useState(initialValue);

  useEffect(() => {
    if (!visible) return;
    setName(initialValue);
    const t = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(t);
  }, [visible, initialValue]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSubmit(trimmed);
  };

  const pasteFromClipboard = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return;
    void Haptics.selectionAsync();
    setName(text);
    inputRef.current?.focus();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <DragDownDismiss onDismiss={onClose} showDim rootInModal style={styles.wrap}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{subtitle}</Text>

            <View style={styles.fieldRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="ชื่อหมวด เช่น มอเตอร์ซ่อม"
                placeholderTextColor="rgba(60,60,67,0.45)"
                autoCapitalize="sentences"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                contextMenuHidden={false}
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={submit}
                selectTextOnFocus={false}
              />
              <Pressable style={styles.pasteBtn} onPress={() => void pasteFromClipboard()}>
                <Text style={styles.pasteText}>วาง</Text>
              </Pressable>
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.btn} onPress={onClose}>
                <Text style={styles.btnText}>ยกเลิก</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnPrimary, !name.trim() && styles.btnOff]}
                onPress={submit}
                disabled={!name.trim()}
              >
                <Text style={[styles.btnText, styles.btnPrimaryText]}>ตกลง</Text>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#000' },
  sub: { marginTop: 4, fontSize: 13, color: 'rgba(60,60,67,0.72)' },
  fieldRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    backgroundColor: '#E5E5EA',
    fontSize: 16,
    color: '#000',
  },
  pasteBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#E8F7F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteText: { fontSize: 15, fontWeight: '800', color: '#0B1F17' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#000' },
  btnOff: { opacity: 0.35 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#000' },
  btnPrimaryText: { color: '#FFF' },
});
