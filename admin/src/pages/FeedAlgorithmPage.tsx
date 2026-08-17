import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ToggleRow } from '../components/ToggleRow';
import { WeightSlider } from '../components/WeightSlider';
import {
  applyFeedPreset,
  configToUi,
  fetchFeedConfig,
  fetchFeedPresets,
  previewFeed,
  rebalanceUiWeights,
  saveFeedConfig,
  uiToConfigPayload,
  type FeedPreset,
  type FeedUiToggles,
  type FeedUiWeights,
  type PersonalUiKey,
  type RankedPreviewItem,
} from '../lib/feedApi';

const DEFAULT_WEIGHTS: FeedUiWeights = {
  interestMatch: 35,
  watchTime: 25,
  freshness: 10,
  creatorDiversity: 5,
  systemSignals: 25,
};

const DEFAULT_TOGGLES: FeedUiToggles = {
  boostNewCreators: true,
  exploreNewInterests: true,
  reduceRepeated: true,
  reduceLowQuality: true,
  geoProximityBoost: true,
  downrankReported: true,
  prioritizeEnergyPush: true,
  hideOutOfStock: true,
};

export function FeedAlgorithmPage() {
  const [weights, setWeights] = useState<FeedUiWeights>(DEFAULT_WEIGHTS);
  const [toggles, setToggles] = useState<FeedUiToggles>(DEFAULT_TOGGLES);
  const [presets, setPresets] = useState<FeedPreset[]>([]);
  const [preview, setPreview] = useState<RankedPreviewItem[]>([]);
  const [previewMeta, setPreviewMeta] = useState<Record<string, unknown> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sampleLocation, setSampleLocation] = useState('จันทบุรี');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'preview' | 'published'>('idle');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [lastLocked, setLastLocked] = useState<PersonalUiKey | undefined>();

  const personalTotal = useMemo(
    () =>
      weights.interestMatch +
      weights.watchTime +
      weights.freshness +
      weights.creatorDiversity,
    [weights],
  );

  const load = useCallback(async () => {
    const [cfg, presetRes] = await Promise.all([fetchFeedConfig(), fetchFeedPresets()]);
    const ui = configToUi(cfg.data);
    setWeights(ui.weights);
    setToggles(ui.toggles);
    setUpdatedAt(cfg.data.updatedAt);
    setPresets(presetRes.data);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, [load]);

  const setWeight = (key: PersonalUiKey, value: number) => {
    setWeights((w) => rebalanceUiWeights(w, key, value));
    setLastLocked(key);
    setMsg(null);
    setStatus('idle');
  };

  const runPreview = async (openModal = false) => {
    setBusy(true);
    setError(null);
    try {
      const r = await previewFeed({
        config: uiToConfigPayload(weights, toggles, lastLocked),
        lockedKey: lastLocked
          ? ({
              interestMatch: 'interestMatchWeight',
              watchTime: 'watchTimeWeight',
              freshness: 'freshnessWeight',
              creatorDiversity: 'creatorDiversityWeight',
            } as const)[lastLocked]
          : undefined,
        sampleLocation,
        userId: 'preview_user_chan',
        limit: 10,
      });
      setPreview(r.data.items);
      setPreviewMeta(r.data.meta);
      setStatus('preview');
      if (openModal) setModalOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'preview ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const patchToggle = <K extends keyof FeedUiToggles>(key: K, value: FeedUiToggles[K]) => {
    setToggles((d) => ({ ...d, [key]: value }));
    setMsg(null);
    setStatus('idle');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="ชุมชน"
        title="Feed"
        description="ปรับน้ำหนักเนื้อหาที่ผู้ใช้เห็น โดยไม่ต้องแก้ระบบหลังบ้าน"
        helpKey="feed"
      />

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="mb-4 text-sm font-medium text-[var(--ok)]">{msg}</p> : null}

      {/* 1-click presets */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="mr-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
          Presets
        </p>
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={p.isActive ? 'btn-primary' : 'btn-secondary'}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void applyFeedPreset(p.id)
                .then(async (r) => {
                  const ui = configToUi(r.data.config);
                  setWeights(ui.weights);
                  setToggles(ui.toggles);
                  setUpdatedAt(r.data.config.updatedAt);
                  setMsg(`ใช้พรีเซ็ต «${p.name}» แล้ว · cache flushed`);
                  setStatus('published');
                  await load();
                })
                .catch((e) => setError(e instanceof Error ? e.message : 'ใช้พรีเซ็ตไม่สำเร็จ'))
                .finally(() => setBusy(false));
            }}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          className="btn-secondary ml-auto"
          disabled={busy}
          onClick={() => void runPreview(true)}
        >
          🔍 ทดลองเสิร์ฟฟีด (Preview)
        </button>
      </div>

      {/* Summary bar 75% + 25% = 100% */}
      <div className="surface-panel mb-5 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
          Score Budget
        </p>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--bg)]">
          <div
            className="bg-[var(--accent)] transition-all"
            style={{ width: `${Math.min(75, personalTotal)}%` }}
            title="Personalization"
          />
          <div className="bg-[var(--ink-tertiary)]/40" style={{ width: '25%' }} title="System" />
        </div>
        <p className="mt-2 text-sm text-[var(--ink-secondary)]">
          Personalization Score ({personalTotal}%) + System Signals (25%) ={' '}
          <span className="font-semibold text-[var(--ink)]">{personalTotal + 25}% Total</span>
          {personalTotal === 75 ? ' · balanced' : ' · auto-normalize on slide'}
        </p>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="border-b border-[var(--line)] px-6 py-5 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
            Personalization
          </p>
          <h2 className="font-display mt-1 text-xl font-extrabold tracking-tight">
            น้ำหนักการจัดอันดับ (auto-normalize → 75%)
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-secondary)]">
            Video ใช้ Watch Time · รูป/ข้อความ/สินค้าใช้ Dwell + CTR
          </p>
        </div>
        <div className="space-y-1 px-6 py-2 sm:px-8">
          <WeightSlider
            label="Interest Match"
            value={weights.interestMatch}
            max={75}
            onChange={(v) => setWeight('interestMatch', v)}
          />
          <WeightSlider
            label="Watch / Dwell Time"
            value={weights.watchTime}
            max={75}
            onChange={(v) => setWeight('watchTime', v)}
          />
          <WeightSlider
            label="Freshness"
            value={weights.freshness}
            max={75}
            onChange={(v) => setWeight('freshness', v)}
          />
          <WeightSlider
            label="Creator Diversity"
            value={weights.creatorDiversity}
            max={75}
            onChange={(v) => setWeight('creatorDiversity', v)}
          />
          <div className="py-3.5 opacity-70">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[15px] font-semibold">System Signals (reserved)</p>
              <p className="font-display text-lg font-extrabold tabular-nums">25%</p>
            </div>
            <p className="text-sm text-[var(--ink-tertiary)]">
              Ads · B-Energy · Location — ล็อกไว้ที่ 25% ตามสเปก
            </p>
          </div>
        </div>
      </div>

      <div className="surface-panel mt-5 overflow-hidden">
        <div className="border-b border-[var(--line)] px-6 py-5 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
            Discovery
          </p>
          <h2 className="font-display mt-1 text-xl font-extrabold tracking-tight">กฎการค้นพบ</h2>
        </div>
        <div className="divide-y divide-[var(--line)] px-6 sm:px-8">
          <ToggleRow
            label="Boost New Creators"
            hint="ช่วยครีเอเตอร์ใหม่ให้ถูกเห็นมากขึ้น"
            checked={toggles.boostNewCreators}
            onChange={(v) => patchToggle('boostNewCreators', v)}
          />
          <ToggleRow
            label="Explore New Interests"
            hint="แนะนำหมวดที่ผู้ใช้ยังไม่เคยลอง"
            checked={toggles.exploreNewInterests}
            onChange={(v) => patchToggle('exploreNewInterests', v)}
          />
          <ToggleRow
            label="Reduce Repeated Content"
            hint="ลดการเห็นคลิป/ร้านซ้ำ"
            checked={toggles.reduceRepeated}
            onChange={(v) => patchToggle('reduceRepeated', v)}
          />
          <ToggleRow
            label="Reduce Low Quality"
            hint="ลดเนื้อหาคุณภาพต่ำ"
            checked={toggles.reduceLowQuality}
            onChange={(v) => patchToggle('reduceLowQuality', v)}
          />
        </div>
      </div>

      <div className="surface-panel mt-5 overflow-hidden">
        <div className="border-b border-[var(--line)] px-6 py-5 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
            การค้าและความปลอดภัย / Commerce & Safety
          </p>
          <h2 className="font-display mt-1 text-xl font-extrabold tracking-tight">
            สัญญาณค้า · ความปลอดภัย
          </h2>
        </div>
        <div className="divide-y divide-[var(--line)] px-6 sm:px-8">
          <ToggleRow
            label="📍 ดันโพสต์/ร้านค้าใกล้เคียง (Geo-Proximity Boost)"
            hint="location ตรงกับผู้ใช้ → คะแนน × 1.25"
            checked={toggles.geoProximityBoost}
            onChange={(v) => patchToggle('geoProximityBoost', v)}
          />
          <ToggleRow
            label="🛡️ ลดการมองเห็นเนื้อหาที่มีการรายงาน/ความเสี่ยง"
            hint="reportCount > 0 → safety factor × 0.3"
            checked={toggles.downrankReported}
            onChange={(v) => patchToggle('downrankReported', v)}
          />
          <ToggleRow
            label="⚡ ให้โควตาโพสต์ที่ใช้พลังงาน B-Energy ดัน"
            hint="system multiplier + สำหรับ Energy Push"
            checked={toggles.prioritizeEnergyPush}
            onChange={(v) => patchToggle('prioritizeEnergyPush', v)}
          />
          <ToggleRow
            label="📦 ซ่อนสินค้าที่ของหมดชั่วคราว"
            hint="ตัดรายการ out-of-stock ออกจากฟีด"
            checked={toggles.hideOutOfStock}
            onChange={(v) => patchToggle('hideOutOfStock', v)}
          />
        </div>
      </div>

      <div className="surface-panel mt-5 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`status-pill ${status === 'published' ? 'ok' : 'warn'}`}>
            {status === 'published' ? 'Published' : status === 'preview' ? 'Preview draft' : 'Draft'}
          </span>
          <p className="text-sm text-[var(--ink-secondary)]">
            {updatedAt ? `อัปเดต ${new Date(updatedAt).toLocaleString('th-TH')}` : '—'}
          </p>
        </div>
        <label className="mt-4 block text-sm font-semibold text-[var(--ink)]">
          sampleLocation (preview)
          <input
            className="mt-1 w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-sm"
            value={sampleLocation}
            onChange={(e) => setSampleLocation(e.target.value)}
            placeholder="จันทบุรี"
          />
        </label>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void runPreview(true)}
          >
            🔍 ทดลองเสิร์ฟฟีด (Preview)
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void saveFeedConfig(uiToConfigPayload(weights, toggles, lastLocked))
                .then((r) => {
                  const ui = configToUi(r.data);
                  setWeights(ui.weights);
                  setToggles(ui.toggles);
                  setUpdatedAt(r.data.updatedAt);
                  setStatus('published');
                  const flush = r.data.cacheFlush;
                  setMsg(
                    flush
                      ? `เผยแพร่แล้ว · cache memory=${flush.memoryCleared} redis=${flush.redis}`
                      : 'เผยแพร่คอนฟิกฟีดแล้ว',
                  );
                })
                .catch((e) => setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'))
                .finally(() => setBusy(false));
            }}
          >
            Publish
          </button>
        </div>
      </div>

      {/* Preview modal */}
      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="surface-panel max-h-[85vh] w-full max-w-lg overflow-auto p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
                  Live Preview · Top 10
                </p>
                <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                  location={sampleLocation} · draft weights (ยังไม่ Publish ก็ทดลองได้)
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>
                ปิด
              </button>
            </div>
            {previewMeta ? (
              <p className="mt-2 text-[11px] text-[var(--ink-tertiary)]">
                {String(previewMeta.formula ?? '')}
              </p>
            ) : null}
            <ul className="mt-4 space-y-3">
              {preview.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[14px] border border-[var(--line)] bg-[var(--bg)] px-3 py-3"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-[var(--accent)]">#{item.rank}</p>
                      <p className="text-sm font-semibold">
                        {item.productName ?? item.caption.slice(0, 42)}
                      </p>
                      <p className="text-xs text-[var(--ink-secondary)]">
                        {item.authorHandle} · {item.contentType ?? '—'} ·{' '}
                        {item.breakdown.engagementMode}
                        {item.location ? ` · ${item.location}` : ''}
                      </p>
                    </div>
                    <p className="font-display text-lg font-extrabold tabular-nums">
                      {item.score.toFixed(3)}
                    </p>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--ink-tertiary)]">
                    P={item.breakdown.personalizationScore} × S=
                    {item.breakdown.systemMultiplier} × Safe=
                    {item.breakdown.safetyFactor} × Geo={item.breakdown.geoMultiplier}
                  </p>
                  {item.flags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.flags.map((f) => (
                        <span
                          key={f}
                          className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
