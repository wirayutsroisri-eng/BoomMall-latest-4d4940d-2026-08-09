import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { getActor, getApiKey } from '../lib/api';

type ConvType = 'DIRECT' | 'SHOP' | 'GROUP';

type Conv = {
  id: string;
  type: ConvType;
  shopId: string | null;
  shopName: string | null;
  title: string | null;
  updatedAt: string;
  lastMessage?: string | null;
  participants: Array<{ userId: string; role: string }>;
};

type ChatMsg = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  metadata?: { kind?: string; product?: { id: string; title: string; sku: string; price: number; imageUri?: string } };
};

type CatalogItem = {
  productId: string;
  variantId: string;
  title: string;
  sku: string;
  label: string;
  price: number;
  stock: number;
};

type Runtime = {
  redisUrlConfigured: boolean;
  pendingCachedMessages: number;
  prismaChatReady: boolean;
  transport: string;
  horizontalScaling: string;
  inbox?: string;
  conversationTypes?: string[];
};

type Filter = 'ALL' | ConvType;

async function chatReq<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const key = getApiKey();
  if (key) headers.set('Authorization', `Bearer ${key}`);
  headers.set('X-Admin-Actor', getActor());
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json as T;
}

function typeLabel(type: ConvType) {
  if (type === 'SHOP') return 'ร้าน';
  if (type === 'GROUP') return 'กลุ่ม';
  return 'ส่วนตัว';
}

export function ShopChatPage() {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shopForm, setShopForm] = useState({
    shopId: 'shop_chan_fruit',
    shopName: 'สวนใหม่จันท์',
    buyerId: 'buyer_demo',
    sellerId: 'seller_demo',
  });
  const [dmForm, setDmForm] = useState({
    userId: 'buyer_demo',
    peerUserId: 'creator_demo',
    title: 'ทักจากฟีด',
  });
  const [groupForm, setGroupForm] = useState({
    creatorId: 'buyer_demo',
    memberIds: 'creator_demo,seller_demo',
    title: 'กลุ่มชุมชน',
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatMsg[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  const refresh = useCallback(async () => {
    const [r, c] = await Promise.all([
      chatReq<{ ok: true; data: Runtime }>('/api/v1/admin/chat-domain/runtime'),
      chatReq<{ ok: true; data: Conv[] }>('/api/v1/admin/chat-domain/conversations'),
    ]);
    setRuntime(r.data);
    setConvs(c.data);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, [refresh]);

  const visible = useMemo(
    () => (filter === 'ALL' ? convs : convs.filter((c) => c.type === filter)),
    [convs, filter],
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="แชต"
        title="กล่องแชทรวม"
        description="ร้านค้า · ทักจากฟีด · กลุ่ม — การ์ดสินค้าจากคลังถูกบันทึกในข้อความเดียวกันกับแชทลูกค้า"
      />

      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-[var(--ok)]">{msg}</p> : null}

      <div className="surface-panel mb-5 p-5">
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">Runtime</p>
        {runtime ? (
          <ul className="mt-2 space-y-1 text-sm text-[var(--ink-secondary)]">
            <li>Inbox: {runtime.inbox ?? 'unified'}</li>
            <li>Types: {(runtime.conversationTypes ?? ['DIRECT', 'SHOP', 'GROUP']).join(' · ')}</li>
            <li>Transport: {runtime.transport}</li>
            <li>Scaling: {runtime.horizontalScaling}</li>
            <li>Redis: {runtime.redisUrlConfigured ? 'yes' : 'no (memory fallback)'}</li>
            <li>Pending cache: {runtime.pendingCachedMessages}</li>
            <li>Prisma: {runtime.prismaChatReady ? 'ready' : 'json fallback'}</li>
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink-tertiary)]">กำลังโหลด…</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void refresh()}>
            Refresh
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void chatReq<{ ok: true; data: { flushed: number } }>('/api/v1/admin/chat-domain/flush', {
                method: 'POST',
                body: '{}',
              })
                .then((r) => {
                  setMsg(`Flushed ${r.data.flushed} messages`);
                  return refresh();
                })
                .catch((e) => setError(e instanceof Error ? e.message : 'flush failed'))
                .finally(() => setBusy(false));
            }}
          >
            Flush cache → DB
          </button>
        </div>
      </div>

      <div className="surface-panel mb-5 p-5">
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">เปิดห้องในกล่องเดียวกัน</p>

        <p className="mt-4 text-sm font-semibold">แชทร้าน</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['shopId', 'Shop ID'],
              ['shopName', 'ชื่อร้าน'],
              ['buyerId', 'Buyer ID'],
              ['sellerId', 'Seller ID'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm font-semibold">
              {label}
              <input
                className="mt-1 w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-sm font-normal"
                value={shopForm[key]}
                onChange={(e) => setShopForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn-primary mt-3"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void chatReq('/api/v1/admin/chat-domain/shop/conversations', {
              method: 'POST',
              body: JSON.stringify(shopForm),
            })
              .then(() => {
                setMsg('เปิดห้องแชทร้านในกล่องรวมแล้ว');
                return refresh();
              })
              .catch((e) => setError(e instanceof Error ? e.message : 'สร้างไม่สำเร็จ'))
              .finally(() => setBusy(false));
          }}
        >
          เปิดแชทร้าน
        </button>

        <p className="mt-6 text-sm font-semibold">แชทส่วนตัว (ทักจากฟีด / เพื่อน)</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['userId', 'User ID'],
              ['peerUserId', 'Peer ID'],
              ['title', 'หัวข้อ'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm font-semibold">
              {label}
              <input
                className="mt-1 w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-sm font-normal"
                value={dmForm[key]}
                onChange={(e) => setDmForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-3"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void chatReq('/api/v1/admin/chat-domain/direct', {
              method: 'POST',
              body: JSON.stringify(dmForm),
            })
              .then(() => {
                setMsg('เปิดแชทส่วนตัวในกล่องรวมแล้ว');
                return refresh();
              })
              .catch((e) => setError(e instanceof Error ? e.message : 'สร้างไม่สำเร็จ'))
              .finally(() => setBusy(false));
          }}
        >
          เปิดแชทส่วนตัว
        </button>

        <p className="mt-6 text-sm font-semibold">กลุ่ม</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Creator ID
            <input
              className="mt-1 w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-sm font-normal"
              value={groupForm.creatorId}
              onChange={(e) => setGroupForm((f) => ({ ...f, creatorId: e.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold">
            ชื่อกลุ่ม
            <input
              className="mt-1 w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-sm font-normal"
              value={groupForm.title}
              onChange={(e) => setGroupForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Member IDs (คั่นด้วยจุลภาค)
            <input
              className="mt-1 w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-sm font-normal"
              value={groupForm.memberIds}
              onChange={(e) => setGroupForm((f) => ({ ...f, memberIds: e.target.value }))}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-secondary mt-3"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void chatReq('/api/v1/admin/chat-domain/groups', {
              method: 'POST',
              body: JSON.stringify({
                creatorId: groupForm.creatorId,
                title: groupForm.title,
                memberIds: groupForm.memberIds
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              }),
            })
              .then(() => {
                setMsg('เปิดกลุ่มในกล่องรวมแล้ว');
                return refresh();
              })
              .catch((e) => setError(e instanceof Error ? e.message : 'สร้างไม่สำเร็จ'))
              .finally(() => setBusy(false));
          }}
        >
          เปิดกลุ่ม
        </button>
      </div>

      <div className="surface-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">ห้องทั้งหมด</p>
          <div className="flex flex-wrap gap-1">
            {(['ALL', 'SHOP', 'DIRECT', 'GROUP'] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={filter === key ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setFilter(key)}
              >
                {key === 'ALL' ? 'ทั้งหมด' : typeLabel(key)}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-tertiary)]">ยังไม่มีห้อง — เปิดด้านบนได้ทุกประเภท</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full rounded-[14px] bg-[var(--bg)] px-3 py-2 text-left text-sm"
                  onClick={() => {
                    setOpenId(c.id);
                    setBusy(true);
                    void Promise.all([
                      chatReq<{ ok: true; data: ChatMsg[] }>(
                        `/api/v1/admin/chat-domain/conversations/${encodeURIComponent(c.id)}/messages`,
                      ),
                      c.shopId
                        ? chatReq<{ ok: true; data: CatalogItem[] }>(
                            `/api/v1/admin/chat-domain/catalog?shopId=${encodeURIComponent(c.shopId)}`,
                          )
                        : Promise.resolve({ data: [] as CatalogItem[] }),
                    ])
                      .then(([msgs, cat]) => {
                        setThread(msgs.data ?? []);
                        setCatalog(cat.data ?? []);
                      })
                      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดข้อความไม่สำเร็จ'))
                      .finally(() => setBusy(false));
                  }}
                >
                  <p className="font-semibold">
                    {typeLabel(c.type)} · {c.title ?? c.shopName ?? c.id}
                  </p>
                  <p className="text-xs text-[var(--ink-tertiary)]">
                    {c.lastMessage ? `${c.lastMessage} · ` : ''}
                    {c.shopId ? `${c.shopId} · ` : ''}
                    {c.participants.map((p) => `${p.role}:${p.userId}`).join(' · ')}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {openId ? (
          <div className="mt-4 rounded-[14px] border border-[var(--line-strong)] p-3">
            <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">ข้อความ + การ์ดสินค้า</p>
            {thread.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--ink-tertiary)]">ยังไม่มีข้อความในห้องนี้</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {thread.map((m) => {
                  const product = m.metadata?.kind === 'product' ? m.metadata.product : null;
                  return (
                    <li key={m.id} className="rounded-[12px] bg-[var(--bg)] px-3 py-2 text-sm">
                      <p className="text-xs text-[var(--ink-tertiary)]">
                        {m.senderId} · {new Date(m.createdAt).toLocaleString('th-TH')}
                      </p>
                      {product ? (
                        <p className="mt-1 font-semibold">
                          📦 {product.title} · {product.sku} · ฿{product.price.toLocaleString('th-TH')}
                        </p>
                      ) : (
                        <p className="mt-1">{m.body}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {catalog.length ? (
              <>
                <p className="mt-4 text-xs font-bold uppercase text-[var(--ink-tertiary)]">คลังที่ลิงก์กับห้องนี้</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {catalog.slice(0, 12).map((item) => (
                    <li key={item.variantId}>
                      {item.title} · {item.sku} · คงเหลือ {item.stock}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
