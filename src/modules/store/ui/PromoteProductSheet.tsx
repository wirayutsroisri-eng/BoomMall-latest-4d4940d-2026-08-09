import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { coverMedia, resolveProductMedia } from '@/modules/commerce/domain/product-media';
import type { MasterSku } from '@/modules/commerce/domain/types';
import {
  createProductPromotion,
  FALLBACK_PACKAGES,
  fetchMyPromotions,
  fetchPromotionPackages,
  type PromotionPackage,
  type SellerPromotion,
} from '@/modules/store/data/promotionApi';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

type Props = {
  visible: boolean;
  product: MasterSku | null;
  onClose: () => void;
};

const AD_COPY: Record<SellerPromotion['adStatus'], string> = {
  pending_review: 'รอแอดมินตรวจสอบหลักฐาน — โฆษณายังไม่เริ่ม',
  active: 'กำลังดันฟีดอยู่',
  expired: 'หมดอายุแล้ว — ส่งคำขอใหม่ได้',
  rejected: 'ถูกปฏิเสธ',
  stopped: 'ปิดก่อนกำหนด',
};

function formatThb(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

export function PromoteProductSheet({ visible, product, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [packages, setPackages] = useState<PromotionPackage[]>(FALLBACK_PACKAGES);
  const [picked, setPicked] = useState<string>('boost_7d');
  const [transactionId, setTransactionId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<SellerPromotion | null>(null);

  useEffect(() => {
    if (!visible || !product) return;
    let cancelled = false;
    void fetchPromotionPackages()
      .then((r) => {
        if (!cancelled && r.data.length) setPackages(r.data);
      })
      .catch(() => undefined);
    void fetchMyPromotions(product.id)
      .then((r) => {
        if (cancelled) return;
        const open =
          r.data.find((p) => p.adStatus === 'pending_review' || p.adStatus === 'active') ??
          r.data[0] ??
          null;
        setExisting(open);
      })
      .catch(() => setExisting(null));
    return () => {
      cancelled = true;
    };
  }, [visible, product?.id]);

  const cover = useMemo(
    () => (product ? coverMedia(resolveProductMedia(product)) : null),
    [product],
  );

  if (!product) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View />
      </Modal>
    );
  }

  const locked =
    existing?.adStatus === 'pending_review' || existing?.adStatus === 'active';

  async function submit() {
    if (!product || locked) return;
    setBusy(true);
    try {
      const res = await createProductPromotion({
        productId: product.id,
        productTitle: product.title,
        shopName: product.shopName,
        productImageUrl: cover?.uri,
        productMediaType: cover?.type,
        packageType: picked,
        transactionId: transactionId.trim() || undefined,
        paymentProofUrl: proofUrl.trim() || undefined,
      });
      setExisting(res.data);
      Alert.alert(
        'ส่งคำขอแล้ว',
        res.message ??
          'รอแอดมินตรวจสอบ — โฆษณายังไม่เริ่มจนกว่าจะได้รับอนุมัติ (ยังไม่ถือว่าชำระสำเร็จ)',
      );
      onClose();
    } catch (e) {
      Alert.alert('ส่งคำขอไม่ได้', e instanceof Error ? e.message : 'ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <DragDownDismiss onDismiss={onClose} rootInModal style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="ปิด" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.handle} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.kicker}>ดันฟีดสินค้า</Text>
            <Text style={styles.title} numberOfLines={2}>
              {product.title}
            </Text>
            <Text style={styles.hint}>
              ส่งคำขอให้แอดมินตรวจหลักฐานการโอน — ระบบจะไม่ขึ้นว่าชำระสำเร็จจนกว่าจะอนุมัติ
            </Text>

            {existing ? (
              <View style={styles.statusBox}>
                <Text style={styles.statusTitle}>{AD_COPY[existing.adStatus]}</Text>
                <Text style={styles.statusMeta}>
                  {existing.packageLabel} · {formatThb(existing.priceThb)}
                  {existing.rejectReason ? `\n${existing.rejectReason}` : ''}
                </Text>
              </View>
            ) : null}

            <Text style={styles.section}>เลือกแพ็กเกจ</Text>
            {packages.map((pkg) => {
              const on = picked === pkg.packageType;
              return (
                <Pressable
                  key={pkg.packageType}
                  style={[styles.pkg, on && styles.pkgOn]}
                  onPress={() => setPicked(pkg.packageType)}
                  disabled={locked}
                >
                  <View>
                    <Text style={[styles.pkgLabel, on && styles.pkgLabelOn]}>{pkg.label}</Text>
                    <Text style={styles.pkgDays}>{pkg.durationDays} วันบนฟีด</Text>
                  </View>
                  <Text style={[styles.pkgPrice, on && styles.pkgLabelOn]}>
                    {formatThb(pkg.priceThb)}
                  </Text>
                </Pressable>
              );
            })}

            <Text style={styles.section}>หลักฐานการโอน (ไม่บังคับ)</Text>
            <TextInput
              style={styles.input}
              placeholder="เลขอ้างอิง / transaction id"
              placeholderTextColor={colors.text.muted}
              value={transactionId}
              onChangeText={setTransactionId}
              editable={!locked}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="ลิงก์สลิป (ถ้ามี)"
              placeholderTextColor={colors.text.muted}
              value={proofUrl}
              onChangeText={setProofUrl}
              editable={!locked}
              autoCapitalize="none"
              keyboardType="url"
            />
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>ปิด</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, (busy || locked) && { opacity: 0.45 }]}
              onPress={() => void submit()}
              disabled={busy || locked}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="megaphone-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {locked ? 'รอตรวจสอบ' : 'ส่งคำขอโฆษณา'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </DragDownDismiss>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginTop: 10,
    marginBottom: 8,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 12 },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: colors.brand.primaryDark,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text.primary, marginBottom: 6 },
  hint: { fontSize: 13, lineHeight: 18, color: colors.text.secondary, marginBottom: 12 },
  statusBox: {
    backgroundColor: '#F6F8F7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  statusTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary },
  statusMeta: { marginTop: 4, fontSize: 12, color: colors.text.secondary, lineHeight: 17 },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.secondary,
    marginBottom: 8,
    marginTop: 4,
  },
  pkg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D5DBD8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pkgOn: { borderColor: colors.brand.primaryDark, backgroundColor: '#F3FBF7' },
  pkgLabel: { fontSize: 15, fontWeight: '800', color: colors.text.primary },
  pkgLabelOn: { color: colors.brand.primaryDark },
  pkgDays: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
  pkgPrice: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  input: {
    borderWidth: 1,
    borderColor: '#D5DBD8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text.primary,
    marginBottom: 8,
  },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  secondaryBtn: {
    flex: 0.42,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DBD8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  primaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
