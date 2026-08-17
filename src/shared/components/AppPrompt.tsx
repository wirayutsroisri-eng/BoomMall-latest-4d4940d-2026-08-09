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
  type KeyboardTypeOptions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';

export type AppPromptOptions = {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  maxLength?: number;
  okLabel?: string;
  cancelLabel?: string;
};

type PromptRequest = AppPromptOptions & {
  resolve: (value: string | null) => void;
};

let active: PromptRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

/** Replaces Alert.prompt — real TextInput so iOS Paste works. */
export function promptText(options: AppPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    active?.resolve(null);
    active = { ...options, resolve };
    emit();
  });
}

export function AppPromptHost() {
  const [, setTick] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState('');
  const req = active;

  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    setValue(req.defaultValue ?? '');
    const t = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(t);
  }, [req]);

  const close = (next: string | null) => {
    const current = active;
    active = null;
    emit();
    current?.resolve(next);
  };

  const submit = () => {
    void Haptics.selectionAsync();
    close(value);
  };

  const pasteFromClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text) return;
    void Haptics.selectionAsync();
    setValue(req?.secureTextEntry ? text.replace(/\D/g, '').slice(0, req.maxLength ?? text.length) : text);
    inputRef.current?.focus();
  };

  if (!req) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => close(null)}>
      <DragDownDismiss onDismiss={() => close(null)} showDim rootInModal style={styles.wrap}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <View style={styles.card}>
            <Text style={styles.title}>{req.title}</Text>
            {req.message ? <Text style={styles.sub}>{req.message}</Text> : null}
            <View style={styles.fieldRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={value}
                onChangeText={setValue}
                placeholder={req.placeholder}
                placeholderTextColor="rgba(60,60,67,0.45)"
                keyboardType={req.keyboardType}
                secureTextEntry={req.secureTextEntry}
                maxLength={req.maxLength}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                contextMenuHidden={false}
                returnKeyType="done"
                onSubmitEditing={submit}
              />
              {req.secureTextEntry ? null : (
                <Pressable style={styles.pasteBtn} onPress={() => void pasteFromClipboard()}>
                  <Text style={styles.pasteText}>วาง</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.actions}>
              <Pressable style={styles.btn} onPress={() => close(null)}>
                <Text style={styles.btnText}>{req.cancelLabel ?? 'ยกเลิก'}</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={submit}>
                <Text style={[styles.btnText, styles.btnPrimaryText]}>{req.okLabel ?? 'ตกลง'}</Text>
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
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  card: {
    backgroundColor: '#fff',
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
  btnText: { fontSize: 16, fontWeight: '700', color: '#000' },
  btnPrimaryText: { color: '#fff' },
});
