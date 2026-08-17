import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { getActor, getApiKey } from '../lib/api';
import { ProductPromotionsPanel } from './ProductPromotionsPanel';

type Campaign = {
  id: string;
  advertiserId: string;
  name: string;
  placement: string;
  status: string;
  budgetThb: string;
  spentThb: string;
  targetingJson?: { geo?: string; channel?: string } | null;
  creatives: Array<{ id: string; title: string; active: boolean }>;
};

type Invoice = {
  id: string;
  campaignId: string;
  invoiceNumber: string;
  amountThb: string;
  status: string;
  pspRef?: string | null;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const key = getApiKey();
  if (key) headers.set('Authorization', `Bearer ${key}`);
  headers.set('X-Admin-Actor', getActor());
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(path, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json as T;
}

export function AdsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'billing' ? 'billing' : 'promotions';

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="โฆษณา"
        title="แคมเปญ / ดันฟีด"
        description="โฆษณาและโปรโมทร้าน — ค่าโฆษณาเป็นเงินบาท แยกจากส่วนแบ่งร้าน"
        helpKey="ads"
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          className={tab === 'promotions' ? 'btn-primary !py-2 !text-sm' : 'btn-secondary !py-2 !text-sm'}
          onClick={() => setParams({ tab: 'promotions' })}
        >
          ดันฟีดสินค้า
        </button>
        <button
          type="button"
          className={tab === 'billing' ? 'btn-primary !py-2 !text-sm' : 'btn-secondary !py-2 !text-sm'}
          onClick={() => setParams({ tab: 'billing' })}
        >
          Banner / Billing
        </button>
      </div>

      {tab === 'promotions' ? <ProductPromotionsPanel /> : <AdsBillingPanel />}
    </div>
  );
}

function AdsBillingPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState('แบนเนอร์โฮม');
  const [placement, setPlacement] = useState<'BANNER' | 'SPONSORED_FEED' | 'APP_OPEN'>('BANNER');
  const [budget, setBudget] = useState('5000');
  const [geo, setGeo] = useState('');
  const [channel, setChannel] = useState('');
  const [billCampaignId, setBillCampaignId] = useState('');
  const [billAmount, setBillAmount] = useState('1000');

  const reload = useCallback(async () => {
    setError(null);
    const [c, i] = await Promise.all([
      req<{ ok: true; data: Campaign[] }>('/api/v1/admin/ecommerce/ads/campaigns'),
      req<{ ok: true; data: Invoice[] }>('/api/v1/admin/ecommerce/ads/invoices'),
    ]);
    setCampaigns(c.data);
    setInvoices(i.data);
  }, []);

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, [reload]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      await req('/api/v1/admin/ecommerce/ads/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          advertiserId: 'merchant_demo',
          name,
          placement,
          budgetThb: budget,
          targeting: { geo: geo.trim() || undefined, channel: channel.trim() || undefined },
          creative: { title: name, body: 'BoomMall ad' },
        }),
      });
      setMsg('สร้างแคมเปญแล้ว (สถานะ DRAFT)');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างไม่สำเร็จ');
    }
  }

  async function activate(id: string) {
    setError(null);
    try {
      await req(`/api/v1/admin/ecommerce/ads/campaigns/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปเดตไม่สำเร็จ');
    }
  }

  async function issueInvoice(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      const r = await req<{ ok: true; data: Invoice }>('/api/v1/admin/ecommerce/ads/invoices', {
        method: 'POST',
        body: JSON.stringify({ campaignId: billCampaignId, amountThb: billAmount }),
      });
      setMsg(`ออกใบแจ้งหนี้ ${r.data.invoiceNumber} — เก็บค่าโฆษณาเป็น THB (ไม่ใช่ GP)`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ออกใบแจ้งหนี้ไม่สำเร็จ');
    }
  }

  async function payInvoice(id: string) {
    setError(null);
    setMsg(null);
    try {
      await req(`/api/v1/admin/ecommerce/ads/invoices/${id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: `pay_${id}_${Date.now()}` }),
      });
      setMsg('ชำระสำเร็จ');
      await reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'ชำระไม่สำเร็จ — ต้องต่อ PSP จริง (ห้ามจำลองสำเร็จ)',
      );
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-[var(--accent)]">{msg}</p> : null}

      <form onSubmit={onCreate} className="surface-panel mb-5 space-y-3 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
          สร้างแคมเปญ
        </p>
        <input
          className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อแคมเปญ"
        />
        <div className="flex gap-2">
          <select
            className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            value={placement}
            onChange={(e) => setPlacement(e.target.value as 'BANNER' | 'SPONSORED_FEED' | 'APP_OPEN')}
          >
            <option value="BANNER">BANNER</option>
            <option value="SPONSORED_FEED">SPONSORED_FEED</option>
            <option value="APP_OPEN">APP_OPEN</option>
          </select>
          <input
            className="flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="งบ THB"
          />
          <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">
            สร้าง
          </button>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            placeholder="เป้า geo (เช่น TH)"
          />
          <input
            className="flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="เป้า channel (เช่น B2C)"
          />
        </div>
      </form>

      <div className="surface-panel mb-5 p-5">
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">แคมเปญ</p>
        <ul className="mt-3 space-y-3">
          {campaigns.length === 0 ? (
            <li className="text-sm text-[var(--ink-tertiary)]">ยังไม่มีแคมเปญ</li>
          ) : (
            campaigns.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3 text-sm">
                <div>
                  <p className="font-semibold text-[var(--ink)]">{c.name}</p>
                  <p className="text-[var(--ink-tertiary)]">
                    {c.placement} · {c.status} · budget {c.budgetThb} / spent {c.spentThb}
                    {c.targetingJson?.geo || c.targetingJson?.channel
                      ? ` · ${[c.targetingJson.geo, c.targetingJson.channel].filter(Boolean).join(' / ')}`
                      : ''}
                  </p>
                </div>
                {c.status !== 'ACTIVE' ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs font-semibold text-[var(--accent)]"
                    onClick={() => void activate(c.id)}
                  >
                    เปิด ACTIVE
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>

      <form onSubmit={issueInvoice} className="surface-panel mb-5 space-y-3 p-5">
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">ออกใบแจ้งหนี้ค่าโฆษณา</p>
        <select
          className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          value={billCampaignId}
          onChange={(e) => setBillCampaignId(e.target.value)}
        >
          <option value="">เลือกแคมเปญ</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            value={billAmount}
            onChange={(e) => setBillAmount(e.target.value)}
            placeholder="จำนวน THB"
          />
          <button type="submit" className="rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white">
            ออกใบแจ้งหนี้
          </button>
        </div>
      </form>

      <div className="surface-panel p-5">
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">ใบแจ้งหนี้</p>
        <ul className="mt-3 space-y-3">
          {invoices.length === 0 ? (
            <li className="text-sm text-[var(--ink-tertiary)]">ยังไม่มีใบแจ้งหนี้</li>
          ) : (
            invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold">{inv.invoiceNumber}</p>
                  <p className="text-[var(--ink-tertiary)]">
                    {inv.amountThb} THB · {inv.status}
                    {inv.pspRef ? ` · ${inv.pspRef}` : ''}
                  </p>
                </div>
                {inv.status === 'ISSUED' ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--accent)]"
                    onClick={() => void payInvoice(inv.id)}
                  >
                    ชำระผ่าน PSP
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
        <p className="mt-4 text-xs text-[var(--ink-tertiary)]">
          PSP ยังไม่ต่อจะคืน PSP_NOT_CONFIGURED — ไม่จำลองชำระสำเร็จ (App Store 3.1)
        </p>
      </div>
    </div>
  );
}
