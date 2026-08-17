import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ConfirmSheet, type ConfirmRequest } from '../components/ConfirmSheet';
import {
  adminResetPassword,
  adminSetUserRole,
  fetchAdminUsers,
  type AdminUserRow,
} from '../lib/api';

const ROLES = ['BUYER', 'SELLER', 'ADMIN'] as const;

type Pending =
  | { kind: 'role'; userId: string; role: string; req: ConfirmRequest }
  | { kind: 'reset'; userId: string; req: ConfirmRequest };

export function UsersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ userId: string; password: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminUsers();
      setRows(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดผู้ใช้ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRole = (userId: string, role: string) => {
    setPending({
      kind: 'role',
      userId,
      role,
      req: {
        title: `เปลี่ยนสิทธิ์เป็น ${role}?`,
        effects: [
          'สิทธิ์ใหม่มีผลทันที',
          'การขายหรือการเข้าเมนูร้านอาจเปลี่ยนตามสิทธิ์',
          'ถูกบันทึกในประวัติการทำงาน',
        ],
        confirmLabel: 'ยืนยันเปลี่ยนสิทธิ์',
        requireReason: true,
        danger: role === 'ADMIN',
      },
    });
  };

  const onReset = (userId: string) => {
    setPending({
      kind: 'reset',
      userId,
      req: {
        title: 'รีเซ็ตรหัสผ่านบัญชีนี้?',
        effects: ['รหัสเดิมใช้ไม่ได้ทันที', 'จะได้รหัสชั่วคราวครั้งเดียว', 'ให้ส่งต่อผู้ใช้แล้วให้เปลี่ยนเอง'],
        confirmLabel: 'ยืนยันรีเซ็ต',
        requireReason: true,
        danger: true,
      },
    });
  };

  const runPending = async () => {
    if (!pending) return;
    setBusyId(pending.userId);
    try {
      if (pending.kind === 'role') {
        await adminSetUserRole(pending.userId, pending.role);
        await refresh();
      } else {
        const res = await adminResetPassword(pending.userId);
        setTempPassword({ userId: pending.userId, password: res.data.temporaryPassword });
      }
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="ผู้ใช้"
        title="ผู้ใช้"
        description="ค้นหาบัญชี เปลี่ยนสิทธิ์ หรือส่งต่อไปศูนย์ความปลอดภัยเมื่อต้องจำกัดบัญชี"
        helpKey="users"
      />
      {error ? (
        <div className="mb-6 rounded-[14px] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}
      {tempPassword ? (
        <div className="mb-6 rounded-[14px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm">
          รหัสชั่วคราวของ {tempPassword.userId}: <strong>{tempPassword.password}</strong> — ส่งครั้งเดียวแล้วให้ผู้ใช้เปลี่ยน
        </div>
      ) : null}
      <div className="overflow-x-auto surface-panel">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-xs uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
              <th className="px-4 py-3 font-bold">ชื่อ</th>
              <th className="px-4 py-3 font-bold">Handle</th>
              <th className="px-4 py-3 font-bold">บทบาท</th>
              <th className="px-4 py-3 font-bold">ร้าน</th>
              <th className="px-4 py-3 font-bold">อัปเดต</th>
              <th className="px-4 py-3 font-bold">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-[var(--ink-secondary)]" colSpan={6}>
                  กำลังโหลด…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-[var(--ink-secondary)]" colSpan={6}>
                  ยังไม่มีผู้ใช้ในระบบ — เมื่อมีคนล็อกอินผ่านแอปจะโชว์ที่นี่
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.userId} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3 font-semibold">{row.displayName || row.userId}</td>
                  <td className="px-4 py-3">{row.handle ?? '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1"
                      value={row.role}
                      disabled={busyId === row.userId}
                      onChange={(e) => onRole(row.userId, e.target.value)}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                      {!ROLES.includes(row.role as (typeof ROLES)[number]) ? (
                        <option value={row.role}>{row.role}</option>
                      ) : null}
                    </select>
                  </td>
                  <td className="px-4 py-3">{row.shopId ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--ink-secondary)]">
                    {new Date(row.updatedAt).toLocaleString('th-TH')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busyId === row.userId}
                      onClick={() => onReset(row.userId)}
                    >
                      รีเซ็ตรหัส
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ConfirmSheet
        open={Boolean(pending)}
        request={pending?.req ?? null}
        busy={Boolean(busyId)}
        onCancel={() => setPending(null)}
        onConfirm={() => void runPending()}
      />
    </div>
  );
}
