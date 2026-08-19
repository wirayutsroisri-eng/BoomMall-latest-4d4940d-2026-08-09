import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { THAI_BANKS, maskAccountNo } from '@/modules/store/domain/payout-accounts';
import { colors } from '@/shared/theme/colors';
import {
  fetchSellerFinanceDashboard,
  requestSellerWithdraw,
  saveSellerBankAccount,
  setSellerPaymentPin,
  type SellerFinanceDashboard,
} from '@/modules/commerce/data/commerceApi';
import { PinSixInput } from './PinSixInput';
import { SellerFinanceReportPanel } from './SellerFinanceReportPanel';

function formatRemaining(ms: number) {
  if (ms <= 0) return '';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.ceil((ms % 3_600_000) / 60_000);
  if (h > 0) return `อีกประมาณ ${h} ชม. ${m} นาที`;
  return `อีกประมาณ ${m} นาที`;
}

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

type HistTab = 'all' | 'orders' | 'withdrawals' | 'report';

type LedgerRow = {
  id: string;
  kind: 'order' | 'withdraw';
  at: string;
  title: string;
  gross: number;
  gp: number;
  net: number;
  statusKey: string;
  statusLabel: string;
  statusTone: 'hold' | 'ready' | 'done' | 'transfer' | 'muted';
  proof?: string | null;
};

function orderStatus(
  o: SellerFinanceDashboard['orders'][number],
): Pick<LedgerRow, 'statusKey' | 'statusLabel' | 'statusTone'> {
  if (o.paidOutAt) {
    return { statusKey: 'paid_out', statusLabel: 'ถอนสำเร็จ', statusTone: 'done' };
  }
  if (o.releaseStatus === 'HELD') {
    return { statusKey: 'held', statusLabel: 'รอดำเนินการ 7 วัน', statusTone: 'hold' };
  }
  if (o.releaseStatus === 'RELEASED') {
    return { statusKey: 'ready', statusLabel: 'พร้อมถอน', statusTone: 'ready' };
  }
  if (o.releaseStatus === 'REFUNDED') {
    return { statusKey: 'refunded', statusLabel: 'คืนเงินแล้ว', statusTone: 'muted' };
  }
  return { statusKey: o.releaseStatus, statusLabel: o.releaseStatus, statusTone: 'muted' };
}

function withdrawStatus(status: string): Pick<LedgerRow, 'statusKey' | 'statusLabel' | 'statusTone'> {
  if (status === 'TRANSFERRED') return { statusKey: status, statusLabel: 'ถอนสำเร็จ', statusTone: 'done' };
  if (status === 'APPROVED' || status === 'PENDING') {
    return { statusKey: status, statusLabel: 'กำลังโอน', statusTone: 'transfer' };
  }
  if (status === 'REJECTED') return { statusKey: status, statusLabel: 'ถูกปฏิเสธ', statusTone: 'muted' };
  return { statusKey: status, statusLabel: status, statusTone: 'muted' };
}

const BADGE: Record<LedgerRow['statusTone'], { bg: string; fg: string }> = {
  hold: { bg: '#FFF4E5', fg: '#9A6700' },
  ready: { bg: '#E8F1FB', fg: '#1D4E89' },
  done: { bg: '#E8F6EF', fg: '#0C7A52' },
  transfer: { bg: '#F3E8FF', fg: '#6B21A8' },
  muted: { bg: '#F0F2F5', fg: '#5C636A' },
};

export function SellerFinanceScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 720;

  const [data, setData] = useState<SellerFinanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<HistTab>('all');

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [withdrawPin, setWithdrawPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [bankOpen, setBankOpen] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [savingBank, setSavingBank] = useState(false);

  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [pinNew, setPinNew] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [pinCurrent, setPinCurrent] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const [slipText, setSlipText] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);

  const refresh = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetchSellerFinanceDashboard();
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดกระเป๋าไม่สำเร็จ');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const available = data?.availableBalance ?? 0;
  const pending = data?.pendingBalance ?? 0;
  const totalPaidOut = data?.totalPaidOut ?? 0;
  const bank = data?.bankAccount ?? null;
  const holdDays = data?.autoCompleteDays ?? 7;
  const security = data?.security;
  const pinSet = Boolean(security?.pinSet);
  const pinLockMs = security?.pinLockRemainingMs ?? 0;
  const bankCoolingMs = security?.bankCoolingRemainingMs ?? 0;

  const ledger = useMemo((): LedgerRow[] => {
    if (!data) return [];
    const orders: LedgerRow[] = data.orders
      .filter((o) => o.releaseStatus !== 'CANCELLED')
      .map((o) => {
        const st = orderStatus(o);
        return {
          id: `ord-${o.orderId}`,
          kind: 'order' as const,
          at: o.createdAt ?? o.releaseDueDate ?? new Date().toISOString(),
          title: `คำสั่งซื้อ #${o.orderId.slice(0, 10)}`,
          gross: o.grossAmount,
          gp: o.gpAmount,
          net: o.netMerchantAmount,
          proof: o.payoutProof,
          ...st,
        };
      });
    const wds: LedgerRow[] = (data.withdrawals ?? []).map((w) => {
      const st = withdrawStatus(w.status);
      return {
        id: `wd-${w.id}`,
        kind: 'withdraw' as const,
        at: w.transferredAt ?? w.createdAt,
        title: 'คำขอถอนเงิน',
        gross: 0,
        gp: 0,
        net: -w.amount,
        proof: w.proofOfTransfer,
        ...st,
      };
    });
    return [...orders, ...wds].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [data]);

  const filtered = useMemo(() => {
    if (tab === 'report') return [];
    if (tab === 'orders') return ledger.filter((r) => r.kind === 'order');
    if (tab === 'withdrawals') return ledger.filter((r) => r.kind === 'withdraw');
    return ledger;
  }, [ledger, tab]);

  const openBankEditor = () => {
    setBankName(bank?.bankName ?? '');
    setBankAccountNo(bank?.bankAccountNo ?? '');
    setBankAccountName(bank?.bankAccountName ?? '');
    setTaxId(data?.taxProfile?.taxId ?? '');
    setStoreAddress(data?.taxProfile?.address ?? '');
    setBankOpen(true);
  };

  const openWithdraw = () => {
    if (!bank?.bankAccountNo) {
      Alert.alert('ยังไม่มีบัญชีรับเงิน', 'ตั้งบัญชีธนาคารก่อนถอน', [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ตั้งบัญชี', onPress: openBankEditor },
      ]);
      return;
    }
    if (!pinSet) {
      Alert.alert('ยังไม่ได้ตั้ง Payment PIN', 'ตั้งรหัส 6 หลักก่อนถอนเงิน เพื่อความปลอดภัย', [
        { text: 'ยกเลิก', style: 'cancel' },
        { text: 'ตั้ง PIN', onPress: () => setPinSetupOpen(true) },
      ]);
      return;
    }
    if (pinLockMs > 0) {
      Alert.alert('ถอนเงินถูกระงับชั่วคราว', `ใส่ PIN ผิดหลายครั้ง — ${formatRemaining(pinLockMs)}`);
      return;
    }
    if (bankCoolingMs > 0) {
      Alert.alert(
        'ยังถอนไม่ได้',
        'บัญชีธนาคารเพิ่งมีการเปลี่ยนแปลง กรุณารอ 24 ชั่วโมง เพื่อความปลอดภัย',
      );
      return;
    }
    if (available <= 0) {
      Alert.alert('ยังไม่มียอดถอนได้', 'รอออเดอร์ปลดล็อกจาก escrow ก่อน');
      return;
    }
    setAmountText(String(available));
    setWithdrawPin('');
    setWithdrawOpen(true);
  };

  const submitWithdraw = async () => {
    const amount = Number(String(amountText).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('ยอดไม่ถูกต้อง', 'กรอกจำนวนเงินที่ต้องการถอน');
      return;
    }
    if (amount > available) {
      Alert.alert('ยอดเกิน', `ถอนได้สูงสุด ${formatTHB(available)}`);
      return;
    }
    if (!/^\d{6}$/.test(withdrawPin)) {
      Alert.alert('ใส่ Payment PIN', 'กรอกรหัส 6 หลักให้ครบ');
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestSellerWithdraw(amount, withdrawPin);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWithdrawOpen(false);
      setWithdrawPin('');
      await refresh(true);
      const auto = res.data.status === 'TRANSFERRED' && res.data.payoutChannel === 'AUTO';
      Alert.alert(
        auto ? 'โอนออโต้สำเร็จ' : 'ส่งคำขอถอนแล้ว',
        res.data.message ??
          (auto
            ? 'ระบบโอนเข้าบัญชีแล้ว'
            : 'ยอดถูกตัดจากพร้อมถอนแล้ว รอแอดมินโอน — ยังไม่ใช่การโอนสำเร็จ'),
      );
    } catch (e) {
      setWithdrawPin('');
      void refresh(true);
      Alert.alert('ถอนไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPinSetup = async () => {
    if (!/^\d{6}$/.test(pinNew)) {
      Alert.alert('PIN ไม่ครบ', 'ตั้งรหัส 6 หลัก');
      return;
    }
    if (pinNew !== pinConfirm) {
      Alert.alert('PIN ไม่ตรงกัน', 'ยืนยัน PIN ให้ตรงกัน');
      return;
    }
    if (!pinSet && !pinPassword.trim()) {
      Alert.alert('ยืนยันรหัสผ่าน', 'ตั้ง PIN ครั้งแรกต้องใส่รหัสผ่านบัญชี');
      return;
    }
    if (pinSet && !pinPassword.trim() && !/^\d{6}$/.test(pinCurrent)) {
      Alert.alert('ยืนยันตัวตน', 'ใส่ PIN เดิม หรือรหัสผ่านบัญชี');
      return;
    }
    setSavingPin(true);
    try {
      await setSellerPaymentPin({
        pin: pinNew,
        password: pinPassword.trim() || undefined,
        currentPin: /^\d{6}$/.test(pinCurrent) ? pinCurrent : undefined,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPinSetupOpen(false);
      setPinNew('');
      setPinConfirm('');
      setPinPassword('');
      setPinCurrent('');
      await refresh(true);
      Alert.alert('ตั้ง PIN สำเร็จ', 'ใช้รหัสนี้เมื่อถอนเงินเท่านั้น อย่าแชร์กับใคร');
    } catch (e) {
      Alert.alert('ตั้ง PIN ไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่');
    } finally {
      setSavingPin(false);
    }
  };

  const submitBank = async () => {
    const name = bankName.trim();
    const no = bankAccountNo.replace(/\D/g, '');
    const owner = bankAccountName.trim();
    const tid = taxId.replace(/\D/g, '');
    const addr = storeAddress.trim();
    if (!name) {
      Alert.alert('เลือกธนาคาร');
      return;
    }
    if (no.length < 10) {
      Alert.alert('เลขบัญชีไม่ครบ', 'ต้องมีอย่างน้อย 10 หลัก');
      return;
    }
    if (!owner) {
      Alert.alert('ใส่ชื่อบัญชี');
      return;
    }
    if (tid && tid.length !== 13) {
      Alert.alert('เลขผู้เสียภาษีไม่ครบ', 'ต้องมี 13 หลัก (หรือเว้นว่างไว้ก่อน)');
      return;
    }
    setSavingBank(true);
    try {
      await saveSellerBankAccount({
        bankName: name,
        bankAccountNo: no,
        bankAccountName: owner,
        taxId: tid,
        address: addr,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBankOpen(false);
      await refresh(true);
      Alert.alert(
        'บันทึกบัญชีแล้ว',
        bank?.bankAccountNo && bank.bankAccountNo === no
          ? 'อัปเดตข้อมูลภาษี/บัญชีแล้ว'
          : 'บัญชีธนาคารเพิ่งมีการเปลี่ยนแปลง กรุณารอ 24 ชั่วโมง เพื่อความปลอดภัย ก่อนถอนเงิน',
      );
    } catch (e) {
      Alert.alert('บันทึกไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่');
    } finally {
      setSavingBank(false);
    }
  };

  const cardWidth = wide ? ('31.5%' as const) : ('100%' as const);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>กระเป๋าเงินร้านค้า</Text>
          <Text style={styles.sub}>ยอดหลังหัก GP · พัก escrow {holdDays} วัน</Text>
        </View>
        <Pressable hitSlop={10} onPress={() => void refresh(true)}>
          <Ionicons name="refresh" size={20} color={colors.text.secondary} />
        </Pressable>
      </View>

      {error ? (
        <Pressable style={styles.errorBox} onPress={() => void refresh()}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorRetry}>แตะเพื่อลองใหม่</Text>
        </Pressable>
      ) : null}

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 28, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && !data ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand.primaryDark} />
        ) : (
          <>
            <View style={[styles.cardsRow, wide && styles.cardsRowWide]}>
              <View style={[styles.card, styles.cardPrimary, { width: cardWidth }]}>
                <Text style={styles.cardLabelOnDark}>ยอดเงินที่ถอนได้</Text>
                <Text style={styles.cardValueOnDark}>{formatTHB(available)}</Text>
                <Text style={styles.cardHintOnDark}>Available Balance</Text>
                <Pressable style={styles.primaryBtn} onPress={openWithdraw}>
                  <Ionicons name="arrow-down-circle" size={18} color={colors.brand.primaryDark} />
                  <Text style={styles.primaryBtnText}>ถอนเงินเข้าบัญชี</Text>
                </Pressable>
              </View>

              <View style={[styles.card, { width: cardWidth }]}>
                <View style={styles.cardLabelRow}>
                  <Text style={styles.cardLabel}>เงินรอดำเนินการ</Text>
                  <Pressable hitSlop={8} onPress={() => setTipOpen(true)}>
                    <View style={styles.tipDot}>
                      <Text style={styles.tipDotText}>?</Text>
                    </View>
                  </Pressable>
                </View>
                <Text style={styles.cardValue}>{formatTHB(pending)}</Text>
                <Text style={styles.cardHint}>Pending Escrow · รอปลดล็อก {holdDays} วัน</Text>
              </View>

              <View style={[styles.card, { width: cardWidth }]}>
                <Text style={styles.cardLabel}>ยอดถอนสะสมสำเร็จ</Text>
                <Text style={styles.cardValue}>{formatTHB(totalPaidOut)}</Text>
                <Text style={styles.cardHint}>Total Paid Out</Text>
              </View>
            </View>

            <Pressable style={styles.profileCard} onPress={openBankEditor}>
              <View style={styles.bankIcon}>
                <Ionicons name="business-outline" size={20} color={colors.brand.primaryDark} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.bankTitle}>บัญชีรับเงินและข้อมูลภาษี</Text>
                {bank?.bankAccountNo ? (
                  <>
                    <Text style={styles.bankName} numberOfLines={1}>
                      {bank.bankName || 'ธนาคาร'} · {maskAccountNo(bank.bankAccountNo)}
                    </Text>
                    <Text style={styles.bankOwner} numberOfLines={1}>
                      {bank.bankAccountName}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.bankHint}>ยังไม่ได้ผูกบัญชีถอน</Text>
                )}
                <Text style={styles.taxLine} numberOfLines={2}>
                  {data?.taxProfile?.taxId
                    ? `ภาษี ${data.taxProfile.taxId}${data.taxProfile.address ? ' · มีที่อยู่' : ' · ยังไม่มีที่อยู่'}`
                    : 'ยังไม่มีเลขผู้เสียภาษี — กรอกเพื่อใบสรุปยอด PDF'}
                </Text>
              </View>
              <Text style={styles.bankEditText}>{bank?.bankAccountNo ? 'แก้ไข' : 'ตั้งค่า'}</Text>
            </Pressable>

            <Pressable style={styles.securityRow} onPress={() => setPinSetupOpen(true)}>
              <Ionicons name={pinSet ? 'lock-closed' : 'lock-open-outline'} size={18} color={colors.brand.primaryDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.securityTitle}>{pinSet ? 'Payment PIN พร้อมใช้' : 'ตั้ง Payment PIN'}</Text>
                <Text style={styles.securitySub}>
                  {pinSet ? 'แตะเพื่อเปลี่ยนรหัส 6 หลัก' : 'ต้องตั้งก่อนถอนเงิน'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
            </Pressable>

            {bankCoolingMs > 0 ? (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>
                  บัญชีธนาคารเพิ่งมีการเปลี่ยนแปลง กรุณารอ 24 ชั่วโมง เพื่อความปลอดภัย (
                  {formatRemaining(bankCoolingMs)})
                </Text>
              </View>
            ) : null}
            {pinLockMs > 0 ? (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>ถอนเงินถูกระงับชั่วคราว — {formatRemaining(pinLockMs)}</Text>
              </View>
            ) : null}

            <View style={styles.tabs}>
              {(
                [
                  ['all', 'ทั้งหมด'],
                  ['orders', 'ออเดอร์'],
                  ['withdrawals', 'ถอนเงิน'],
                  ['report', 'รายงาน'],
                ] as const
              ).map(([id, label]) => (
                <Pressable key={id} onPress={() => setTab(id)} style={[styles.tab, tab === id && styles.tabOn]}>
                  <Text style={[styles.tabText, tab === id && styles.tabTextOn]} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {tab === 'report' ? (
              <SellerFinanceReportPanel onEditTaxProfile={openBankEditor} />
            ) : filtered.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>ยังไม่มีรายการในแท็บนี้</Text>
              </View>
            ) : (
              filtered.map((row) => {
                const badge = BADGE[row.statusTone];
                return (
                  <View key={row.id} style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {row.title}
                      </Text>
                      <Text style={styles.rowMeta}>{new Date(row.at).toLocaleString('th-TH')}</Text>
                      {row.kind === 'order' ? (
                        <Text style={styles.rowSplit}>
                          ขาย {formatTHB(row.gross)} · หัก GP {formatTHB(row.gp)} · สุทธิ {formatTHB(row.net)}
                        </Text>
                      ) : null}
                      <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.badgeText, { color: badge.fg }]}>{row.statusLabel}</Text>
                      </View>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={[styles.rowAmount, row.net < 0 && styles.rowAmountOut]}>
                        {row.net < 0 ? `−${formatTHB(Math.abs(row.net))}` : formatTHB(row.net)}
                      </Text>
                      {row.proof ? (
                        <Pressable onPress={() => setSlipText(row.proof!)}>
                          <Text style={styles.link}>{row.kind === 'withdraw' ? 'ดูสลิป' : 'รายละเอียด'}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={tipOpen} transparent animationType="fade" onRequestClose={() => setTipOpen(false)}>
        <Pressable style={styles.dim} onPress={() => setTipOpen(false)}>
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>เงินรอดำเนินการคืออะไร?</Text>
            <Text style={styles.tipBody}>
              ยอดจากออเดอร์ที่ชำระแล้ว แต่ยังอยู่ในช่วงจัดส่งหรือประกัน {holdDays} วันหลังส่งสำเร็จ จะเข้า
              “ยอดถอนได้” เมื่อผู้ซื้อยืนยันรับของ หรือครบกำหนดอัตโนมัติโดยไม่มีข้อพิพาท
            </Text>
            <Pressable style={styles.secondaryBtn} onPress={() => setTipOpen(false)}>
              <Text style={styles.secondaryBtnText}>เข้าใจแล้ว</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={withdrawOpen} transparent animationType="slide" onRequestClose={() => setWithdrawOpen(false)}>
        <DragDownDismiss
          onDismiss={() => {
            setWithdrawOpen(false);
            setWithdrawPin('');
          }}
          showDim
          rootInModal
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>ถอนเงินเข้าบัญชี</Text>
            <Text style={styles.sheetHint}>สูงสุด {formatTHB(available)}</Text>

            <View style={styles.bankMini}>
              <Ionicons name="card-outline" size={18} color={colors.text.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bankMiniTitle}>
                  โอนเข้า · {bank?.bankName} · {maskAccountNo(bank?.bankAccountNo ?? undefined)}

                </Text>
                <Text style={styles.bankMiniSub}>ชื่อบัญชี: {bank?.bankAccountName}</Text>
              </View>
              <Pressable
                onPress={() => {
                  setWithdrawOpen(false);
                  setTimeout(openBankEditor, 280);
                }}
              >
                <Text style={styles.link}>เปลี่ยน</Text>
              </Pressable>
            </View>

            <View style={styles.secureNote}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#0C7A52" />
              <Text style={styles.secureNoteText}>
                ตรวจสอบชื่อบัญชีด้านบนให้ถูกต้อง ใส่ PIN ผิดเกิน 5 ครั้งจะระงับถอน 1 ชั่วโมง
              </Text>
            </View>

            <TextInput
              style={styles.input}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              placeholder="จำนวนเงินที่ต้องการถอน"
              placeholderTextColor={colors.text.muted}
            />
            <Pressable style={styles.chip} onPress={() => setAmountText(String(available))}>
              <Text style={styles.chipText}>ถอนทั้งหมด</Text>
            </Pressable>

            <Text style={styles.fieldLabel}>Payment PIN (6 หลัก)</Text>
            <PinSixInput value={withdrawPin} onChange={setWithdrawPin} autoFocus />

            <Pressable
              style={[styles.withdrawBtn, submitting && { opacity: 0.6 }, { marginTop: 16 }]}
              disabled={submitting}
              onPress={() => void submitWithdraw()}
            >
              <Text style={styles.withdrawBtnText}>{submitting ? 'กำลังส่ง…' : 'ยืนยันถอนเงิน'}</Text>
            </Pressable>
          </View>
        </DragDownDismiss>
      </Modal>

      <Modal
        visible={pinSetupOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPinSetupOpen(false)}
      >
        <DragDownDismiss
          onDismiss={() => setPinSetupOpen(false)}
          showDim
          rootInModal
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{pinSet ? 'เปลี่ยน Payment PIN' : 'ตั้ง Payment PIN'}</Text>
            <Text style={styles.sheetHint}>รหัส 6 หลักสำหรับถอนเงิน — อย่าใช้วันเกิดหรือเลขซ้ำ</Text>

            {!pinSet ? (
              <>
                <Text style={styles.fieldLabel}>รหัสผ่านบัญชี (ยืนยันตัวตน)</Text>
                <TextInput
                  style={styles.input}
                  value={pinPassword}
                  onChangeText={setPinPassword}
                  secureTextEntry
                  placeholder="รหัสผ่านเข้าสู่ระบบ"
                  placeholderTextColor={colors.text.muted}
                  autoCapitalize="none"
                />
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>PIN เดิม หรือรหัสผ่านบัญชี</Text>
                <PinSixInput value={pinCurrent} onChange={setPinCurrent} />
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>หรือรหัสผ่านบัญชี</Text>
                <TextInput
                  style={styles.input}
                  value={pinPassword}
                  onChangeText={setPinPassword}
                  secureTextEntry
                  placeholder="รหัสผ่าน (ถ้าไม่ใช้ PIN เดิม)"
                  placeholderTextColor={colors.text.muted}
                  autoCapitalize="none"
                />
              </>
            )}

            <Text style={styles.fieldLabel}>PIN ใหม่</Text>
            <PinSixInput value={pinNew} onChange={setPinNew} autoFocus={!pinSet} />
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>ยืนยัน PIN ใหม่</Text>
            <PinSixInput value={pinConfirm} onChange={setPinConfirm} />

            <Pressable
              style={[styles.withdrawBtn, savingPin && { opacity: 0.6 }, { marginTop: 16 }]}
              disabled={savingPin}
              onPress={() => void submitPinSetup()}
            >
              <Text style={styles.withdrawBtnText}>{savingPin ? 'กำลังบันทึก…' : 'บันทึก PIN'}</Text>
            </Pressable>
          </View>
        </DragDownDismiss>
      </Modal>

      <Modal visible={bankOpen} transparent animationType="slide" onRequestClose={() => setBankOpen(false)}>
        <DragDownDismiss
          onDismiss={() => setBankOpen(false)}
          showDim
          rootInModal
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '88%' }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>
              {bank?.bankAccountNo ? 'แก้ไขบัญชีและข้อมูลภาษี' : 'เพิ่มบัญชีและข้อมูลภาษี'}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>ธนาคาร</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {THAI_BANKS.map((b) => (
                  <Pressable
                    key={b}
                    style={[styles.bankChip, bankName === b && styles.bankChipOn]}
                    onPress={() => setBankName(b)}
                  >
                    <Text style={[styles.bankChipText, bankName === b && styles.bankChipTextOn]}>{b}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.fieldLabel}>เลขบัญชี</Text>
              <TextInput
                style={styles.input}
                value={bankAccountNo}
                onChangeText={(t) => setBankAccountNo(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                placeholder="เลขบัญชี"
                placeholderTextColor={colors.text.muted}
              />
              <Text style={styles.fieldLabel}>ชื่อบัญชี</Text>
              <TextInput
                style={styles.input}
                value={bankAccountName}
                onChangeText={setBankAccountName}
                placeholder="ชื่อเจ้าของบัญชี"
                placeholderTextColor={colors.text.muted}
              />
              <Text style={styles.fieldLabel}>เลขประจำตัวผู้เสียภาษี (13 หลัก)</Text>
              <TextInput
                style={styles.input}
                value={taxId}
                onChangeText={(t) => setTaxId(t.replace(/\D/g, '').slice(0, 13))}
                keyboardType="number-pad"
                placeholder="สำหรับใบสรุปยอด / ส่งบัญชี"
                placeholderTextColor={colors.text.muted}
              />
              <Text style={styles.fieldLabel}>ที่อยู่ร้าน / ที่อยู่จดทะเบียน</Text>
              <TextInput
                style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                value={storeAddress}
                onChangeText={setStoreAddress}
                placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
                placeholderTextColor={colors.text.muted}
                multiline
              />
              <Pressable
                style={[styles.withdrawBtn, savingBank && { opacity: 0.6 }]}
                disabled={savingBank}
                onPress={() => void submitBank()}
              >
                <Text style={styles.withdrawBtnText}>{savingBank ? 'กำลังบันทึก…' : 'บันทึกบัญชีและข้อมูลภาษี'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </DragDownDismiss>
      </Modal>

      <Modal visible={Boolean(slipText)} transparent animationType="fade" onRequestClose={() => setSlipText(null)}>
        <Pressable style={styles.dim} onPress={() => setSlipText(null)}>
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>สลิป / หลักฐานโอน</Text>
            <Text style={styles.tipBody} selectable>
              {slipText}
            </Text>
            <Pressable style={styles.secondaryBtn} onPress={() => setSlipText(null)}>
              <Text style={styles.secondaryBtnText}>ปิด</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text.primary },
  sub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FDE8EE',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: '#C81E4A', fontWeight: '700', fontSize: 13 },
  errorRetry: { marginTop: 4, color: '#C81E4A', fontSize: 12, fontWeight: '600' },
  cardsRow: { gap: 10, marginBottom: 12 },
  cardsRowWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  cardPrimary: { backgroundColor: colors.brand.primaryDark },
  cardLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  cardLabelOnDark: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.78)' },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardValue: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  cardValueOnDark: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  cardHint: { marginTop: 4, fontSize: 11, fontWeight: '600', color: colors.text.muted },
  cardHintOnDark: { marginTop: 4, fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  tipDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EEF0F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipDotText: { fontSize: 10, fontWeight: '800', color: colors.text.muted },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtnText: { fontWeight: '800', fontSize: 14, color: colors.brand.primaryDark },
  bankCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  taxLine: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
    lineHeight: 16,
  },
  bankLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bankIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(12,122,82,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankTitle: { fontSize: 11, fontWeight: '700', color: colors.text.muted },
  bankName: { marginTop: 2, fontSize: 14, fontWeight: '800', color: colors.text.primary },
  bankNo: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  bankOwner: { marginTop: 1, fontSize: 12, fontWeight: '600', color: colors.text.muted },
  bankHint: { marginTop: 2, fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  bankEdit: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F0F2F5',
  },
  bankEditText: { fontSize: 12, fontWeight: '800', color: colors.brand.primaryDark },
  securityRow: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  securityTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary },
  securitySub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  warnBox: {
    backgroundColor: '#FFF4E5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  warnText: { fontSize: 12, fontWeight: '700', color: '#9A6700', lineHeight: 18 },
  secureNote: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#E8F6EF',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  secureNoteText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#0C7A52', lineHeight: 17 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#E8E8ED',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
    gap: 2,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabOn: { backgroundColor: '#fff' },
  tabText: { fontSize: 11, fontWeight: '700', color: colors.text.secondary, textAlign: 'center' },
  tabTextOn: { color: colors.text.primary },
  empty: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
  },
  emptyText: { color: colors.text.muted, fontWeight: '600', fontSize: 13 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 10,
  },
  rowTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary },
  rowMeta: { marginTop: 2, fontSize: 11, fontWeight: '600', color: colors.text.muted },
  rowSplit: { marginTop: 4, fontSize: 11, fontWeight: '700', color: colors.text.secondary },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '800' },
  rowRight: { alignItems: 'flex-end', justifyContent: 'flex-start', gap: 6 },
  rowAmount: { fontSize: 15, fontWeight: '800', color: colors.text.primary },
  rowAmountOut: { color: '#C81E4A' },
  link: { fontSize: 12, fontWeight: '800', color: colors.brand.primaryDark },
  dim: {
    flex: 1,
    backgroundColor: 'rgba(20,21,22,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  tipCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  tipTitle: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  tipBody: { marginTop: 8, fontSize: 13, lineHeight: 19, fontWeight: '600', color: colors.text.secondary },
  secondaryBtn: {
    marginTop: 14,
    backgroundColor: '#F0F2F5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontWeight: '800', color: colors.text.primary },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.text.primary },
  sheetHint: {
    color: colors.text.secondary,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
    fontWeight: '600',
  },
  bankMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface.canvas,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  bankMiniTitle: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  bankMiniSub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.text.muted, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface.canvas,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 12,
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF0F2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 14,
  },
  chipText: { fontSize: 12, fontWeight: '800', color: colors.brand.primaryDark },
  withdrawBtn: {
    backgroundColor: colors.brand.primaryDark,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  withdrawBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  bankChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F0F2F5',
    marginRight: 8,
  },
  bankChipOn: { backgroundColor: colors.brand.primaryDark },
  bankChipText: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  bankChipTextOn: { color: '#fff' },
});
