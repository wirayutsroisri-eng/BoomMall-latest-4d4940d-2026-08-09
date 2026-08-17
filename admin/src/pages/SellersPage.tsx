import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { fetchCommerceSellers, type CommerceSellerRow } from '../lib/api';

export function SellersPage() {
  const [params] = useSearchParams();
  const view = params.get('view');
  const [sellers, setSellers] = useState<CommerceSellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const shops = await fetchCommerceSellers();
      setSellers(shops.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลผู้ขายไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const title =
    view === 'products' ? 'สินค้าในคลังร่วม' : view === 'warehouse' ? 'Shared Warehouse' : 'ร้านค้า';
  const description =
    view === 'products'
      ? 'จำนวนสินค้าต่อร้านจากคลังร่วม — ไม่สร้างคลังใหม่'
      : view === 'warehouse'
        ? 'คลังร่วมที่ใช้ร่วมกันทั้งแพลตฟอร์ม ร้านด้านล่างคือร้านที่อยู่ในคลังนี้'
        : 'ร้านที่เปิดขายบน BoomMall — การเงิน GP อยู่ที่เมนูการเงิน';

  return (
    <div>
      <PageHeader
        eyebrow="การซื้อขาย"
        title={title}
        description={description}
        helpKey="sellers"
        actions={
          <div className="flex gap-2">
            <Link to="/finance" className="btn-secondary">
              เปิดการเงินแพลตฟอร์ม
            </Link>
            <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'กำลังอัปเดต…' : 'รีเฟรช'}
            </button>
          </div>
        }
      />
      {error ? (
        <div className="mb-6 rounded-[14px] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}
      <div className="overflow-x-auto surface-panel">
        <p className="border-b border-[var(--line)] px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
          ร้านค้าจากคลังร่วม
        </p>
        {sellers.length ? (
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
                <th className="px-4 py-3 font-bold">ร้าน</th>
                <th className="px-4 py-3 font-bold">Merchant</th>
                <th className="px-4 py-3 font-bold">สินค้า</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((row) => (
                <tr key={row.merchantId} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3 font-semibold">{row.shopName}</td>
                  <td className="px-4 py-3">{row.merchantId}</td>
                  <td className="px-4 py-3">{row.productCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4">
            <EmptyState
              title="ยังไม่มีร้านในคลังร่วม"
              description="เมื่อมีร้านเปิดขาย ระบบจะแสดงชื่อร้าน จำนวนสินค้า และลิงก์ไปการเงินที่นี่เอง"
            />
          </div>
        )}
      </div>
    </div>
  );
}
