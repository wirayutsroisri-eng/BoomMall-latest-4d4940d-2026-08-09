import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useWarehouseStore } from '@/modules/warehouse/state/warehouse-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { ROLE_LABEL } from '@/modules/warehouse/domain/warehouse-core';
import type { WarehouseRole } from '@/modules/warehouse/domain/types';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { BASE_CATEGORIES } from '@/modules/store/state/categories-store';
import { colors } from '@/shared/theme/colors';
import { promptText } from '@/shared/components/AppPrompt';

const ASSIGNABLE_ROLES: WarehouseRole[] = ['ADMIN', 'INVENTORY_MANAGER', 'SELLER', 'VIEWER'];

export function WarehouseSharingScreen() {
  const insets = useSafeAreaInsets();
  const myShopId = useAuthStore((s) => s.user?.shopId ?? '');
  const [inviteQuery, setInviteQuery] = useState('');

  const warehouses = useWarehouseStore((s) => s.warehouses);
  const members = useWarehouseStore((s) => s.members);
  const invitations = useWarehouseStore((s) => s.invitations);
  const requests = useWarehouseStore((s) => s.requests);
  const listings = useWarehouseStore((s) => s.listings);
  const audit = useWarehouseStore((s) => s.audit);
  const profiles = useWarehouseStore((s) => s.profiles);
  const profileOf = useWarehouseStore((s) => s.profileOf);
  const invite = useWarehouseStore((s) => s.invite);
  const sendAccessRequest = useWarehouseStore((s) => s.sendAccessRequest);
  const respondToRequest = useWarehouseStore((s) => s.respondToRequest);
  const changeMemberRole = useWarehouseStore((s) => s.changeMemberRole);
  const revoke = useWarehouseStore((s) => s.revoke);
  const setAutoSync = useWarehouseStore((s) => s.setAutoSync);
  const autoSyncOf = useWarehouseStore((s) => s.autoSyncOf);

  const masters = useInventoryStore((s) => s.masters);

  const myWarehouse = warehouses.find((w) => w.ownerShopId === myShopId);
  const sharedWithMe = warehouses.filter(
    (w) =>
      w.ownerShopId !== myShopId &&
      members.some((m) => m.warehouseId === w.id && m.shopId === myShopId),
  );
  const requestable = warehouses.filter(
    (w) =>
      w.ownerShopId !== myShopId &&
      !members.some((m) => m.warehouseId === w.id && m.shopId === myShopId),
  );

  const myMembers = members.filter(
    (m) => m.warehouseId === myWarehouse?.id && m.shopId !== myShopId,
  );
  const myPendingInvites = invitations.filter(
    (i) => i.warehouseId === myWarehouse?.id && i.status === 'pending',
  );
  const myPendingRequests = requests.filter(
    (r) => r.warehouseId === myWarehouse?.id && r.status === 'pending',
  );
  const myAudit = audit.filter((a) => a.warehouseId === myWarehouse?.id).slice(0, 10);

  const productCountByOwner = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of masters) {
      const owner = m.ownerShopId ?? myShopId;
      map.set(owner, (map.get(owner) ?? 0) + 1);
    }
    return map;
  }, [masters, myShopId]);

  const inviteCandidates = useMemo(() => {
    const q = inviteQuery.trim().toLowerCase();
    if (!q) return [];
    return profiles.filter(
      (p) =>
        p.id !== myShopId &&
        (p.name.toLowerCase().includes(q) ||
          p.handle.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q)),
    );
  }, [profiles, inviteQuery, myShopId]);

  const feedback = (result: { ok: boolean; message: string }) => {
    void Haptics.notificationAsync(
      result.ok
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
    Alert.alert(result.ok ? 'สำเร็จ' : 'ทำรายการไม่ได้', result.message);
  };

  const pickRoleThen = (title: string, action: (role: WarehouseRole) => void) => {
    Alert.alert(title, 'เลือกบทบาท (กำหนด Permission ตามบทบาท)', [
      ...ASSIGNABLE_ROLES.map((role) => ({
        text: `${ROLE_LABEL[role]} (${role})`,
        onPress: () => action(role),
      })),
      { text: 'ยกเลิก', style: 'cancel' as const },
    ]);
  };

  const startInvite = (toShopId: string) => {
    if (!myWarehouse) return;
    const profile = profileOf(toShopId);
    pickRoleThen(`เชิญ ${profile?.name ?? toShopId}`, (role) => {
      feedback(invite(myWarehouse.id, toShopId, role));
      setInviteQuery('');
    });
  };

  const openMemberMenu = (shopId: string, currentRole: WarehouseRole) => {
    if (!myWarehouse) return;
    const profile = profileOf(shopId);
    Alert.alert(profile?.name ?? shopId, `บทบาทปัจจุบัน: ${ROLE_LABEL[currentRole]}`, [
      {
        text: 'เปลี่ยนบทบาท / Permission',
        onPress: () =>
          pickRoleThen('เปลี่ยนบทบาท', (role) =>
            feedback(changeMemberRole(myWarehouse.id, shopId, role)),
          ),
      },
      {
        text: 'ถอนสิทธิ์การใช้คลัง',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'ยืนยันถอนสิทธิ์',
            'Listing ของสมาชิกนี้จะถูกปิด (ไม่ลบ Master Product / ประวัติออเดอร์)',
            [
              { text: 'ยกเลิก', style: 'cancel' },
              {
                text: 'ถอนสิทธิ์',
                style: 'destructive',
                onPress: () => feedback(revoke(myWarehouse.id, shopId)),
              },
            ],
          ),
      },
      { text: 'ปิด', style: 'cancel' },
    ]);
  };

  const openAutoSyncMenu = (warehouseId: string) => {
    const setting = autoSyncOf(warehouseId);
    const enabled = setting?.enabled ?? false;
    if (!enabled) {
      Alert.alert(
        'เพิ่มสินค้าใหม่อัตโนมัติ',
        'เมื่อคลังนี้ลงสินค้าใหม่ ระบบจะสร้าง Listing ให้ร้านคุณอัตโนมัติ (ตาม Permission)',
        [
          { text: 'เปิด (ทุกหมวดหมู่)', onPress: () => setAutoSync(warehouseId, true) },
          ...BASE_CATEGORIES.slice(0, 4).map((c) => ({
            text: `เปิดเฉพาะ "${c.label}"`,
            onPress: () => setAutoSync(warehouseId, true, [c.key]),
          })),
          { text: 'ยกเลิก', style: 'cancel' as const },
        ],
      );
    } else {
      setAutoSync(warehouseId, false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}
    >
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>แชร์คลังสินค้า</Text>
          <Text style={styles.subtitle}>Shared Warehouse · Invitation · Permission · Listing</Text>
        </View>
      </View>

      {/* ================= MY WAREHOUSE ================= */}
      {myWarehouse ? (
        <>
          <Text style={styles.sectionTitle}>คลังของฉัน</Text>
          <View style={[styles.warehouseCard, { borderColor: colors.brand.primaryDark }]}>
            <View style={styles.warehouseHeader}>
              <View style={[styles.warehouseIcon, { backgroundColor: myWarehouse.coverColor }]}>
                <Ionicons name="business" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.warehouseName}>{myWarehouse.name}</Text>
                <Text style={styles.meta}>
                  {(productCountByOwner.get(myShopId) ?? 0).toLocaleString('th-TH')} สินค้า ·
                  สมาชิก {myMembers.length + 1} บัญชี · OWNER
                </Text>
              </View>
            </View>

            {/* Pending access requests */}
            {myPendingRequests.length > 0 ? (
              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle}>
                  คำขอใช้คลัง ({myPendingRequests.length})
                </Text>
                {myPendingRequests.map((req) => {
                  const profile = profileOf(req.fromShopId);
                  return (
                    <View key={req.id} style={styles.personRow}>
                      <View style={[styles.avatar, { backgroundColor: profile?.avatarColor ?? '#888' }]}>
                        <Text style={styles.avatarText}>{profile?.name.slice(0, 1) ?? '?'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.personName}>{profile?.name ?? req.fromShopId}</Text>
                        {req.message ? (
                          <Text style={styles.meta} numberOfLines={2}>
                            «{req.message}»
                          </Text>
                        ) : null}
                      </View>
                      <Pressable
                        style={styles.approveBtn}
                        onPress={() =>
                          pickRoleThen('อนุมัติคำขอ', (role) =>
                            feedback(respondToRequest(req.id, true, role)),
                          )
                        }
                      >
                        <Text style={styles.approveBtnText}>อนุมัติ</Text>
                      </Pressable>
                      <Pressable
                        style={styles.rejectBtn}
                        onPress={() => feedback(respondToRequest(req.id, false))}
                      >
                        <Text style={styles.rejectBtnText}>ปฏิเสธ</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Members */}
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>สมาชิก ({myMembers.length})</Text>
              {myMembers.length === 0 ? (
                <Text style={styles.meta}>ยังไม่มีสมาชิก — เชิญผู้ใช้ด้านล่าง</Text>
              ) : (
                myMembers.map((m) => {
                  const profile = profileOf(m.shopId);
                  const memberListings = listings.filter(
                    (l) => l.warehouseId === myWarehouse.id && l.shopId === m.shopId,
                  );
                  return (
                    <Pressable
                      key={m.shopId}
                      style={styles.personRow}
                      onPress={() => openMemberMenu(m.shopId, m.role)}
                    >
                      <View style={[styles.avatar, { backgroundColor: profile?.avatarColor ?? '#888' }]}>
                        <Text style={styles.avatarText}>{profile?.name.slice(0, 1) ?? '?'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.personName}>{profile?.name ?? m.shopId}</Text>
                        <Text style={styles.meta}>
                          {m.permissions.length} สิทธิ์ · Listing {memberListings.length} รายการ
                        </Text>
                      </View>
                      <View style={styles.rolePill}>
                        <Text style={styles.rolePillText}>{ROLE_LABEL[m.role]}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
                    </Pressable>
                  );
                })
              )}
            </View>

            {/* Pending invitations */}
            {myPendingInvites.length > 0 ? (
              <View style={styles.subsection}>
                <Text style={styles.subsectionTitle}>คำเชิญที่ส่งแล้ว (รอตอบรับ)</Text>
                {myPendingInvites.map((inv) => {
                  const profile = profileOf(inv.toShopId);
                  return (
                    <View key={inv.id} style={styles.personRow}>
                      <View style={[styles.avatar, { backgroundColor: profile?.avatarColor ?? '#888' }]}>
                        <Text style={styles.avatarText}>{profile?.name.slice(0, 1) ?? '?'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.personName}>{profile?.name ?? inv.toShopId}</Text>
                        <Text style={styles.meta}>เชิญเป็น {ROLE_LABEL[inv.role]}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Invite */}
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>เชิญสมาชิกใหม่</Text>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={15} color={colors.text.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="ค้นหาบัญชี BoomMall — ชื่อ / @handle / อีเมล"
                  placeholderTextColor={colors.text.muted}
                  value={inviteQuery}
                  onChangeText={setInviteQuery}
                  autoCapitalize="none"
                />
              </View>
              {inviteCandidates.map((p) => (
                <Pressable key={p.id} style={styles.personRow} onPress={() => startInvite(p.id)}>
                  <View style={[styles.avatar, { backgroundColor: p.avatarColor }]}>
                    <Text style={styles.avatarText}>{p.name.slice(0, 1)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{p.name}</Text>
                    <Text style={styles.meta}>
                      {p.handle}
                      {p.email ? ` · ${p.email}` : ''}
                    </Text>
                  </View>
                  <View style={styles.inviteBtn}>
                    <Text style={styles.inviteBtnText}>เชิญ</Text>
                  </View>
                </Pressable>
              ))}
              {inviteQuery.trim() && !inviteCandidates.length ? (
                <Text style={styles.meta}>ไม่พบบัญชี — ระบบเชิญได้เฉพาะบัญชี BoomMall เท่านั้น</Text>
              ) : null}
              <Text style={styles.hintText}>
                รู้อีเมลอย่างเดียวเข้าคลังไม่ได้ — ต้องผ่านคำเชิญ + ผู้รับตอบรับ + Owner กำหนด
                Permission เท่านั้น
              </Text>
            </View>

            {/* Audit log */}
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>Audit Log (ล่าสุด)</Text>
              {myAudit.length === 0 ? (
                <Text style={styles.meta}>ยังไม่มีเหตุการณ์</Text>
              ) : (
                myAudit.map((a) => (
                  <View key={a.id} style={styles.auditRow}>
                    <Text style={styles.auditAction}>{a.action}</Text>
                    <Text style={styles.meta} numberOfLines={2}>
                      {profileOf(a.actorShopId)?.name ?? a.actorShopId}
                      {a.targetShopId ? ` → ${profileOf(a.targetShopId)?.name ?? a.targetShopId}` : ''} ·{' '}
                      {a.detail}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </>
      ) : null}

      {/* ================= SHARED WITH ME ================= */}
      <Text style={styles.sectionTitle}>คลังที่ฉันเข้าถึงได้ ({sharedWithMe.length})</Text>
      {sharedWithMe.length === 0 ? (
        <Text style={[styles.meta, { paddingHorizontal: 16 }]}>
          ยังไม่มี — ขอใช้คลังจากรายการด้านล่าง
        </Text>
      ) : (
        sharedWithMe.map((w) => {
          const membership = members.find(
            (m) => m.warehouseId === w.id && m.shopId === myShopId,
          );
          const installed = listings.filter(
            (l) => l.warehouseId === w.id && l.shopId === myShopId,
          );
          const activeInstalled = installed.filter((l) => l.status === 'active');
          const productCount = productCountByOwner.get(w.ownerShopId) ?? 0;
          const sync = autoSyncOf(w.id);
          return (
            <View key={w.id} style={styles.warehouseCard}>
              <View style={styles.warehouseHeader}>
                <View style={[styles.warehouseIcon, { backgroundColor: w.coverColor }]}>
                  <Ionicons name="business" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.warehouseName}>{w.name}</Text>
                  <Text style={styles.meta}>
                    {productCount.toLocaleString('th-TH')} สินค้า · บทบาทของฉัน:{' '}
                    {membership ? ROLE_LABEL[membership.role] : '-'} · ติดตั้งแล้ว{' '}
                    {activeInstalled.length}
                  </Text>
                </View>
              </View>

              <View style={styles.permChips}>
                {(membership?.permissions ?? []).map((p) => (
                  <View key={p} style={styles.permChip}>
                    <Text style={styles.permChipText}>{p}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.cardActions}>
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() =>
                    router.push({ pathname: '/store/install/[warehouseId]', params: { warehouseId: w.id } })
                  }
                >
                  <Ionicons name="download-outline" size={14} color="#fff" />
                  <Text style={styles.primaryBtnText}>ติดตั้งคลังเข้าหน้าร้าน</Text>
                </Pressable>
                <View style={styles.syncRow}>
                  <Text style={styles.syncLabel}>
                    สินค้าใหม่เข้าร้านอัตโนมัติ
                    {sync?.enabled && sync.categoryKeys?.length
                      ? ` (${sync.categoryKeys.length} หมวด)`
                      : ''}
                  </Text>
                  <Switch
                    value={sync?.enabled ?? false}
                    onValueChange={() => openAutoSyncMenu(w.id)}
                    trackColor={{ true: colors.brand.primary }}
                  />
                </View>
              </View>
            </View>
          );
        })
      )}

      {/* ================= REQUESTABLE ================= */}
      <Text style={styles.sectionTitle}>ขอใช้คลังสินค้า</Text>
      {requestable.length === 0 ? (
        <Text style={[styles.meta, { paddingHorizontal: 16 }]}>
          คุณเข้าถึงทุกคลังในระบบแล้ว
        </Text>
      ) : (
        requestable.map((w) => {
          const owner = profileOf(w.ownerShopId);
          const pending = requests.some(
            (r) => r.warehouseId === w.id && r.fromShopId === myShopId && r.status === 'pending',
          );
          return (
            <View key={w.id} style={styles.warehouseCard}>
              <View style={styles.warehouseHeader}>
                <View style={[styles.warehouseIcon, { backgroundColor: w.coverColor }]}>
                  <Ionicons name="business" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.warehouseName}>{w.name}</Text>
                  <Text style={styles.meta}>
                    เจ้าของ: {owner?.name ?? w.ownerShopId} ·{' '}
                    {(productCountByOwner.get(w.ownerShopId) ?? 0).toLocaleString('th-TH')} สินค้า
                  </Text>
                </View>
                <Pressable
                  style={[styles.requestBtn, pending && { opacity: 0.5 }]}
                  disabled={pending}
                  onPress={() => {
                    void promptText({
                      title: `ขอใช้ ${w.name}`,
                      message: 'ฝากข้อความถึงเจ้าของคลัง (ไม่บังคับ)',
                    }).then((text) => {
                      if (text == null) return;
                      feedback(sendAccessRequest(w.id, text.trim() || undefined));
                    });
                  }}
                >
                  <Text style={styles.requestBtnText}>
                    {pending ? 'รออนุมัติ' : 'ขอใช้คลัง'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F5F4' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.text.primary },
  subtitle: { fontSize: 11, color: colors.text.secondary, fontWeight: '600', marginTop: 1 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  warehouseCard: {
    marginHorizontal: 14,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  warehouseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  warehouseIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warehouseName: { fontSize: 14, fontWeight: '900', color: colors.text.primary },
  meta: { fontSize: 11, color: colors.text.muted, fontWeight: '600', lineHeight: 15 },
  subsection: {
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
    paddingTop: 10,
    gap: 8,
  },
  subsectionTitle: { fontSize: 12, fontWeight: '900', color: colors.text.secondary },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  personName: { fontSize: 12, fontWeight: '800', color: colors.text.primary },
  rolePill: {
    backgroundColor: '#2A2F2C',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rolePillText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  approveBtn: {
    backgroundColor: colors.brand.primaryDark,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  approveBtnText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  rejectBtn: {
    backgroundColor: '#F3F5F4',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border.strong,
  },
  rejectBtnText: { color: colors.text.secondary, fontSize: 11, fontWeight: '800' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F5F4',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: { flex: 1, fontSize: 12, color: colors.text.primary, paddingVertical: 0 },
  inviteBtn: {
    backgroundColor: colors.brand.mist,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inviteBtnText: { color: colors.brand.primaryDark, fontSize: 11, fontWeight: '900' },
  hintText: { fontSize: 10, color: colors.text.muted, lineHeight: 14 },
  auditRow: { gap: 1 },
  auditAction: { fontSize: 10, fontWeight: '900', color: colors.accent.info },
  permChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  permChip: {
    backgroundColor: '#F3F5F4',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  permChipText: { fontSize: 8.5, fontWeight: '800', color: colors.text.secondary },
  cardActions: { gap: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.brand.primaryDark,
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  requestBtn: {
    backgroundColor: colors.brand.primaryDark,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  requestBtnText: { color: '#fff', fontSize: 11, fontWeight: '900' },
});
