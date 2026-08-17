import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { getActor, getApiKey } from '../lib/api';

async function req<T>(path: string): Promise<T> {
  const headers = new Headers();
  const key = getApiKey();
  if (key) headers.set('Authorization', `Bearer ${key}`);
  headers.set('X-Admin-Actor', getActor());
  const res = await fetch(path, { headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json as T;
}

export function DomainsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void req<{ ok: true; data: Record<string, unknown> }>('/api/v1/platform/domains')
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, []);

  const domains = (data?.domains ?? {}) as Record<string, Record<string, unknown>>;
  const policies = (data?.policies ?? {}) as Record<string, string>;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="แพลตฟอร์ม"
        title="บริการ 4 โดเมน"
        description="Auth & Profile (Apple/JWT/RBAC) · E-Commerce (Catalog/GP/Ads billing) · Chat Realtime · Content Feed"
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mb-5 space-y-3">
        {Object.entries(domains).map(([key, value]) => (
          <div key={key} className="surface-panel p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">{key}</p>
            <pre className="mt-2 overflow-auto text-[11px] text-[var(--ink-secondary)]">
              {JSON.stringify(value, null, 2)}
            </pre>
          </div>
        ))}
      </div>

      <div className="surface-panel p-5">
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">Control policies</p>
        <ul className="mt-3 space-y-2 text-sm text-[var(--ink-secondary)]">
          <li>
            <span className="font-semibold text-[var(--ink)]">Marketplace:</span> {policies.marketplace}
          </li>
          <li>
            <span className="font-semibold text-[var(--ink)]">Chat & Social:</span> {policies.chatSocial}
          </li>
        </ul>
        <p className="mt-4 text-xs text-[var(--ink-tertiary)]">
          PSP ยังไม่ต่อจริงจะคืน PSP_NOT_CONFIGURED — ห้ามจำลองชำระเงินสำเร็จ (App Store 3.1)
        </p>
      </div>
    </div>
  );
}
