import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { SummaryCard } from '../../components/SummaryCard';
import {
  fetchChatAnalytics,
  fetchChatBlocks,
  fetchChatEmergency,
  fetchChatNotifications,
  fetchChatRealtime,
  fetchChatRestrictions,
  updateChatEmergency,
  updateChatRestrictions,
  type BlockStats,
  type ChatAnalytics,
  type EmergencyState,
  type PushMonitor,
  type RealtimeMonitor,
  type UserRestrictions,
} from '../../lib/chatApi';
import { ToggleRow } from '../../components/ToggleRow';
import { WeightSlider } from '../../components/WeightSlider';
import { fetchChatPolicies, saveChatPolicyDraft, type ChatPolicy } from '../../lib/chatApi';
import { useAdminAuth } from '../../auth/AdminAuthContext';

export function ChatRealtimePage() {
  const [data, setData] = useState<RealtimeMonitor | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData((await fetchChatRealtime()).data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด Realtime ไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <div>
      <PageHeader eyebrow="แชต · เรียลไทม์" title="มอนิเตอร์เรียลไทม์" description="WebSocket / reconnect / latency จากบริการแชต" />
      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className={`status-pill ${data?.health === 'HEALTHY' ? 'ok' : data?.health === 'DEGRADED' ? 'warn' : 'danger'}`}>
          {data?.health ?? '…'}
        </span>
        {data?.alerts?.map((a) => (
          <span key={a} className="status-pill warn">
            {a}
          </span>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard title="WebSocket Connections" value={fmt(data?.websocketConnections)} />
        <SummaryCard title="Reconnect Rate" value={data ? `${(data.reconnectRate * 100).toFixed(1)}%` : '—'} />
        <SummaryCard title="Connection Errors" value={fmt(data?.connectionErrors)} />
        <SummaryCard title="Latency" value={data ? `${data.latencyMs} ms` : '—'} />
        <SummaryCard title="Dropped Events" value={fmt(data?.droppedEvents)} />
        <SummaryCard title="Duplicate Events" value={fmt(data?.duplicateEvents)} />
      </div>
    </div>
  );
}

export function ChatNotificationsPage() {
  const [data, setData] = useState<PushMonitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchChatNotifications()
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, []);
  return (
    <div>
      <PageHeader
        eyebrow="แชต · การแจ้งเตือน"
        title="พุชแชต"
        description="แยกจาก notification ประเภทอื่น — เฉพาะ Chat push"
      />
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Push Sent" value={fmt(data?.pushSent)} />
        <SummaryCard title="Push Delivered" value={fmt(data?.pushDelivered)} />
        <SummaryCard title="Push Failed" value={fmt(data?.pushFailed)} />
        <SummaryCard title="Notification Retry" value={fmt(data?.notificationRetry)} />
      </div>
    </div>
  );
}

export function ChatAntiSpamPage() {
  const [policy, setPolicy] = useState<ChatPolicy | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchChatPolicies()
      .then((r) => setPolicy({ ...r.data.active, status: 'draft', version: bump(r.data.active.version) }))
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, []);

  if (!policy) return <p className="text-[var(--ink-secondary)]">{error ?? 'กำลังโหลด…'}</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="แชต · กันสแปม"
        title="เกณฑ์กันสแปม"
        description="Repeated / Mass DM / New conversations / Link — ปรับได้ผ่าน Policy backend"
      />
      {msg ? <p className="mb-4 text-sm text-[var(--ok)]">{msg}</p> : null}
      <div className="surface-panel px-6 py-3">
        <WeightSlider
          label="Repeated Message Count"
          value={policy.antiSpam.repeatedMessageCount}
          max={50}
          onChange={(repeatedMessageCount) =>
            setPolicy({ ...policy, antiSpam: { ...policy.antiSpam, repeatedMessageCount } })
          }
        />
        <WeightSlider
          label="Mass DM / Hour"
          value={policy.antiSpam.massDmPerHour}
          max={200}
          onChange={(massDmPerHour) =>
            setPolicy({ ...policy, antiSpam: { ...policy.antiSpam, massDmPerHour } })
          }
        />
        <WeightSlider
          label="New Conversations / Hour"
          value={policy.antiSpam.newConversationsPerHour}
          max={200}
          onChange={(newConversationsPerHour) =>
            setPolicy({
              ...policy,
              antiSpam: { ...policy.antiSpam, newConversationsPerHour },
            })
          }
        />
        <WeightSlider
          label="Link Share / Hour"
          value={policy.antiSpam.linkSharePerHour}
          max={100}
          onChange={(linkSharePerHour) =>
            setPolicy({ ...policy, antiSpam: { ...policy.antiSpam, linkSharePerHour } })
          }
        />
      </div>
      <button
        type="button"
        className="btn-primary mt-5"
        onClick={() => {
          void saveChatPolicyDraft({
            version: policy.version,
            sensitivity: policy.sensitivity,
            detections: policy.detections,
            antiSpam: policy.antiSpam,
            riskThresholds: policy.riskThresholds,
            policyPrompt: policy.policyPrompt,
          })
            .then(() => setMsg('บันทึก Anti-Spam draft แล้ว'))
            .catch((e) => setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'));
        }}
      >
        Save Anti-Spam Draft
      </button>
    </div>
  );
}

export function ChatBlocksPage() {
  const [data, setData] = useState<BlockStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchChatBlocks()
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, []);
  return (
    <div>
      <PageHeader
        eyebrow="แชต · การบล็อก"
        title="ระบบบล็อก"
        description="สถิติการบล็อก — ห้ามใช้จำนวนคนบล็อกเพียงอย่างเดียวเพื่อ Ban"
      />
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <p className="mb-4 text-sm font-semibold text-[var(--warn)]">{data?.note}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard title="Block Rate" value={data ? `${data.blockRate}` : '—'} />
        <SummaryCard title="Unblock Rate" value={data ? `${data.unblockRate}` : '—'} />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="surface-panel p-5">
          <h3 className="font-display text-lg font-extrabold">Most Blocked</h3>
          {(data?.mostBlocked ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ink-tertiary)]">ยังไม่มีข้อมูลจาก Chat Service</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data!.mostBlocked.map((r) => (
                <li key={r.userId} className="flex justify-between">
                  <span>{r.userId}</span>
                  <strong>{r.blockCount}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="surface-panel p-5">
          <h3 className="font-display text-lg font-extrabold">Repeated Abuse</h3>
          {(data?.repeatedAbuseAccounts ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ink-tertiary)]">ยังไม่มีข้อมูล</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data!.repeatedAbuseAccounts.map((r) => (
                <li key={r.userId} className="flex justify-between">
                  <span>{r.userId}</span>
                  <strong>{r.incidents}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const CAPS = [
  'CAN_SEND_MESSAGE',
  'CAN_SEND_MEDIA',
  'CAN_SEND_LINK',
  'CAN_CREATE_NEW_CONVERSATION',
  'CAN_MESSAGE_SELLERS',
  'CAN_MESSAGE_BUYERS',
] as const;

export function ChatRestrictionsPage() {
  const [userId, setUserId] = useState('');
  const [row, setRow] = useState<UserRestrictions | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    if (!userId.trim()) return;
    setError(null);
    try {
      const res = await fetchChatRestrictions(userId.trim());
      setRow(res.data[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="แชต · จำกัดสิทธิ์"
        title="สิทธิ์ผู้ใช้"
        description="Restrict เฉพาะ capability — ไม่ต้องแบนทั้งบัญชี"
      />
      <div className="mb-4 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-[var(--line-strong)] px-3 py-2 text-sm"
          placeholder="User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          โหลด
        </button>
      </div>
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-[var(--ok)]">{msg}</p> : null}
      {row ? (
        <div className="surface-panel divide-y divide-[var(--line)] px-6">
          {CAPS.map((cap) => (
            <ToggleRow
              key={cap}
              label={cap}
              checked={Boolean(row.capabilities[cap])}
              onChange={(v) =>
                setRow({
                  ...row,
                  capabilities: { ...row.capabilities, [cap]: v },
                })
              }
            />
          ))}
          <label className="block py-4 text-sm">
            Reason
            <input
              className="mt-1 w-full rounded-xl border border-[var(--line-strong)] px-3 py-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เหตุผลการจำกัดสิทธิ์"
            />
          </label>
          <div className="py-4">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                void updateChatRestrictions({
                  userId: row.userId,
                  capabilities: row.capabilities,
                  reason,
                })
                  .then(() => setMsg('อัปเดต restrictions แล้ว'))
                  .catch((e) => setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'));
              }}
            >
              Save Restrictions
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ChatAnalyticsPage() {
  const [data, setData] = useState<ChatAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchChatAnalytics()
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, []);
  return (
    <div>
      <PageHeader eyebrow="แชต · วิเคราะห์" title="วิเคราะห์แชต" description="ตัวเลขจาก runtime ที่บริการแชตส่งเข้ามา" />
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard title="DAU Chat" value={fmt(data?.dauChat)} />
        <SummaryCard title="Messages / User" value={fmt(data?.messagesPerUser)} />
        <SummaryCard title="Conversation Creation" value={fmt(data?.conversationCreation)} />
        <SummaryCard title="Reply Rate" value={fmt(data?.replyRate)} />
        <SummaryCard title="Median Reply Time (s)" value={fmt(data?.medianReplyTimeSec)} />
        <SummaryCard title="Blocked Rate" value={fmt(data?.blockedRate)} />
        <SummaryCard title="Report Rate" value={fmt(data?.reportRate)} />
        <SummaryCard title="Spam Rate" value={fmt(data?.spamRate)} />
        <SummaryCard title="Delivery Rate" value={data ? `${data.deliveryRate}%` : '—'} />
        <SummaryCard title="Failure Rate" value={data ? `${data.failureRate}%` : '—'} />
      </div>
    </div>
  );
}

export function ChatEmergencyPage() {
  const { session } = useAdminAuth();
  const can = Boolean(session?.permissions.chatEmergency || session?.role === 'SUPER_ADMIN');
  const [state, setState] = useState<EmergencyState | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetchChatEmergency()
      .then((r) => setState(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, []);

  if (!state) return <p className="text-[var(--ink-secondary)]">{error ?? 'กำลังโหลด…'}</p>;

  const save = async () => {
    if (!can) {
      setError('ต้องใช้ SUPER_ADMIN_API_KEY');
      return;
    }
    if (!window.confirm('ยืนยันการเปลี่ยน Emergency Control? จะถูกบันทึก Audit Log')) return;
    setError(null);
    try {
      const res = await updateChatEmergency({
        patch: {
          pauseNewConversations: state.pauseNewConversations,
          pauseMediaUpload: state.pauseMediaUpload,
          pauseExternalLinks: state.pauseExternalLinks,
          pauseMessaging: state.pauseMessaging,
        },
        confirm: true,
        reason,
      });
      setState(res.data);
      setMsg('อัปเดต Emergency แล้ว');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="แชต · ฉุกเฉิน"
        title="ควบคุมฉุกเฉิน"
        description="Super Admin เท่านั้น — ต้อง Confirmation + Audit Log · ห้าม deploy production จากเครื่องมือนี้"
      />
      {!can ? (
        <div className="mb-4 rounded-[14px] bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--warn)]">
          บัญชีปัจจุบันไม่มีสิทธิ์ SUPER_ADMIN — ดูได้อย่างเดียว
        </div>
      ) : null}
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-[var(--ok)]">{msg}</p> : null}
      <div className="surface-panel divide-y divide-[var(--line)] px-6">
        <ToggleRow
          label="Pause New Conversations"
          checked={state.pauseNewConversations}
          onChange={(pauseNewConversations) => setState({ ...state, pauseNewConversations })}
        />
        <ToggleRow
          label="Pause Media Upload"
          checked={state.pauseMediaUpload}
          onChange={(pauseMediaUpload) => setState({ ...state, pauseMediaUpload })}
        />
        <ToggleRow
          label="Pause External Links"
          checked={state.pauseExternalLinks}
          onChange={(pauseExternalLinks) => setState({ ...state, pauseExternalLinks })}
        />
        <ToggleRow
          label="Pause Messaging"
          checked={state.pauseMessaging}
          onChange={(pauseMessaging) => setState({ ...state, pauseMessaging })}
        />
        <label className="block py-4 text-sm">
          Reason
          <input
            className="mt-1 w-full rounded-xl border border-[var(--line-strong)] px-3 py-2"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผลฉุกเฉิน"
          />
        </label>
        <div className="py-4">
          <button type="button" className="btn-primary !bg-[var(--danger)]" disabled={!can} onClick={() => void save()}>
            Apply Emergency Controls
          </button>
        </div>
      </div>
    </div>
  );
}

function fmt(n?: number) {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

function bump(v: string) {
  const m = v.match(/v(\d+)\.(\d+)/);
  if (!m) return 'v1.1';
  return `v${m[1]}.${Number(m[2]) + 1}`;
}
