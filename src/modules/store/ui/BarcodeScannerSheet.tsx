import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
  title?: string;
  subtitle?: string;
  /**
   * `assign` — camera stamps a new barcode (product edit).
   * `lookup` — camera opens, then seller types SKU/barcode to search.
   */
  mode?: 'assign' | 'lookup';
};

export function BarcodeScannerSheet({
  visible,
  onClose,
  onScanned,
  title = 'สแกนบาร์โค้ด',
  subtitle = 'ใช้กล้องหรือพิมพ์รหัสด้วยตนเอง',
  mode = 'assign',
}: Props) {
  const insets = useSafeAreaInsets();
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!visible) setManual('');
  }, [visible]);

  const submit = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert('ยังไม่มีรหัส', 'พิมพ์บาร์โค้ดหรือ SKU ก่อน');
      return;
    }
    void Haptics.selectionAsync();
    onScanned(trimmed);
  };

  const openCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('ต้องการกล้อง', 'เปิดสิทธิ์กล้องเพื่อสแกนบาร์โค้ดสินค้า');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      allowsEditing: false,
    });
    if (result.canceled) return;
    if (mode === 'assign') {
      const stamp = `${Date.now()}`.slice(-8);
      submit(`885${stamp}`);
      return;
    }
    Alert.alert('พิมพ์รหัสจากฉลาก', 'พิมพ์บาร์โค้ดหรือ SKU ที่เห็นบนสินค้าเพื่อค้นหาทันที');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <DragDownDismiss onDismiss={onClose} showDim rootInModal style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{subtitle}</Text>

          <Pressable style={styles.cameraBtn} onPress={() => void openCamera()}>
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.cameraBtnText}>เปิดกล้องสแกน</Text>
          </Pressable>

          <Text style={styles.miniLabel}>หรือพิมพ์บาร์โค้ด / SKU</Text>
          <TextInput
            style={styles.input}
            value={manual}
            onChangeText={setManual}
            placeholder="เช่น 8850123456789 หรือ BEV-HUB-12"
            placeholderTextColor={colors.text.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => submit(manual)}
          />
          <Pressable style={styles.saveBtn} onPress={() => submit(manual)}>
            <Text style={styles.saveBtnText}>{mode === 'lookup' ? 'ค้นหา' : 'ใช้รหัสนี้'}</Text>
          </Pressable>
        </View>
      </DragDownDismiss>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.text.primary },
  sub: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
    marginBottom: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  cameraBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  cameraBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  miniLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D5DBD8',
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  saveBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
