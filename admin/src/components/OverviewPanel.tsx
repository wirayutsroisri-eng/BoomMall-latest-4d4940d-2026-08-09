import type { DashboardStats } from '../lib/api';
import { StatCard } from './StatCard';

function fmt(n: string) {
  try {
    return BigInt(n).toLocaleString('en-US');
  } catch {
    return n;
  }
}

type Props = {
  stats: DashboardStats | null;
  loading: boolean;
  onRefresh: () => void;
};

export function OverviewPanel({ stats, loading, onRefresh }: Props) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-[#0b1f17]">
            System Status
          </h2>
          <p className="mt-1 text-sm text-[#122820]/70">
            Real-time Boom Coin supply · ห้ามแก้ยอด Wallet โดยตรง (ledger only)
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-xl bg-[#122820] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b1f17] disabled:opacity-50"
        >
          {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Minted Supply"
          value={stats ? fmt(stats.totalMintedSupply) : '—'}
          hint="เริ่มต้น 100,000 + ยอด Approve Top-up"
          accent="mint"
        />
        <StatCard
          label="Circulating Supply"
          value={stats ? fmt(stats.circulatingSupply) : '—'}
          hint={
            stats
              ? `User ${fmt(stats.userBalance)} · Seller ${fmt(stats.sellerBalance)}`
              : 'User + Seller'
          }
          accent="ink"
        />
        <StatCard
          label="Treasury & Reward Pool"
          value={stats ? fmt(stats.treasuryAndRewardPool) : '—'}
          hint={
            stats
              ? `Treasury ${fmt(stats.treasuryBalance)} · Reward ${fmt(stats.rewardPoolBalance)}`
              : 'คลังกลางระบบ'
          }
          accent="ink"
        />
        <StatCard
          label="Total Company Revenue (THB)"
          value={stats ? `฿${fmt(stats.totalCompanyRevenueThb)}` : '—'}
          hint={
            stats
              ? `อนุมัติแล้ว ${stats.approvedTopUpCount} รายการ`
              : 'รายได้จาก Seller Top-up'
          }
          accent="warn"
        />
      </div>

      <div
        className={`rounded-2xl border px-4 py-3 text-sm ${
          stats?.ledgerHealthy
            ? 'border-[#00d68f]/40 bg-[#00d68f]/10 text-[#0b1f17]'
            : 'border-rose-300 bg-rose-50 text-rose-800'
        }`}
      >
        {stats ? (
          <>
            <strong>Ledger reconcile:</strong>{' '}
            {stats.ledgerHealthy
              ? `OK — accounted ${fmt(stats.reconcile.accountedSupply)} = minted ${fmt(stats.totalMintedSupply)}`
              : `MISMATCH — delta ${stats.reconcile.delta}`}
            <span className="ml-2 opacity-60">
              อัปเดต {new Date(stats.generatedAt).toLocaleString('th-TH')}
            </span>
          </>
        ) : (
          'ยังไม่มีข้อมูล'
        )}
      </div>
    </section>
  );
}
