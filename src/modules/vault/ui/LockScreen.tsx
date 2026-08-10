import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useVaultStore } from '@/modules/vault/state/vault-store';
import { colors } from '@/shared/theme/colors';

export function LockScreen() {
  const [digits, setDigits] = useState('');
  const hasPasscode = useVaultStore((s) => s.hasPasscode);
  const setPasscode = useVaultStore((s) => s.setPasscode);
  const unlockWithPasscode = useVaultStore((s) => s.unlockWithPasscode);
  const unlock = useVaultStore((s) => s.unlock);

  const onDigit = async (d: string) => {
    const next = (digits + d).slice(0, 6);
    setDigits(next);
    if (next.length < 6) return;

    if (!hasPasscode) {
      await setPasscode(next);
      Alert.alert('ตั้งรหัสสำเร็จ', 'Boom Vault พร้อมใช้งาน');
      setDigits('');
      return;
    }

    const ok = await unlockWithPasscode(next);
    if (!ok) {
      Alert.alert('รหัสไม่ถูกต้อง');
      setDigits('');
    }
  };

  const onBiometric = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      Alert.alert('Face ID ไม่พร้อม', 'ใช่รหัส Passcode แทนได้');
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'ปลดล็อก Boom Vault',
      fallbackLabel: 'ใช้รหัสผ่าน',
    });
    if (result.success) unlock();
  };

  return (
    <View style={styles.root}>
      <Text style={styles.brand}>Boom Vault</Text>
      <Text style={styles.hint}>
        {hasPasscode ? 'ใส่รหัส 6 หลัก หรือ Face ID' : 'ตั้งรหัส Passcode 6 หลักครั้งแรก'}
      </Text>

      <View style={styles.dots}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={[styles.dot, i < digits.length && styles.dotFilled]} />
        ))}
      </View>

      <View style={styles.pad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key) => (
          <Pressable
            key={key || 'empty'}
            style={styles.key}
            disabled={key === ''}
            onPress={() => {
              if (key === '⌫') {
                setDigits((v) => v.slice(0, -1));
                return;
              }
              if (key) void onDigit(key);
            }}
          >
            <Text style={styles.keyText}>{key}</Text>
          </Pressable>
        ))}
      </View>

      {hasPasscode ? (
        <Pressable style={styles.face} onPress={() => void onBiometric()}>
          <Text style={styles.faceText}>ปลดล็อกด้วย Face ID</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brand: {
    color: colors.accent.vault,
    fontSize: 28,
    fontWeight: '900',
  },
  hint: {
    color: 'rgba(255,255,255,0.65)',
    marginTop: 8,
    marginBottom: 28,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 36,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.accent.vault,
  },
  dotFilled: {
    backgroundColor: colors.accent.vault,
  },
  pad: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  key: {
    width: '33.33%',
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    color: colors.text.inverse,
    fontSize: 28,
    fontWeight: '600',
  },
  face: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  faceText: {
    color: colors.brand.primary,
    fontWeight: '800',
  },
});
