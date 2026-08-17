import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { fetchAdminPosts, type AdminPostRow } from '../lib/api';

export function ContentPage() {
  const [rows, setRows] = useState<AdminPostRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminPosts();
      setRows(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดคอนเทนต์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="ชุมชน"
        title="โพสต์ / คอนเทนต์"
        description="คอนเทนต์จากฟีด — การซ่อนหรือลบทำที่ศูนย์ความปลอดภัย"
        helpKey="content"
      />
      {error ? (
        <div className="mb-6 rounded-[14px] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}
      <div className="overflow-x-auto surface-panel">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-xs uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
              <th className="px-4 py-3 font-bold">เนื้อหา</th>
              <th className="px-4 py-3 font-bold">ผู้โพสต์</th>
              <th className="px-4 py-3 font-bold">สถานะ</th>
              <th className="px-4 py-3 font-bold">ถูกใจ</th>
              <th className="px-4 py-3 font-bold">รายงาน</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-[var(--ink-secondary)]" colSpan={5}>
                  กำลังโหลด…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-[var(--ink-secondary)]" colSpan={5}>
                  ยังไม่มีโพสต์บนเซิร์ฟเวอร์ เมื่อมีคนโพสต์ในแอป รายการจะขึ้นที่นี่ การซ่อนหรือลบทำที่ศูนย์ความปลอดภัย
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--line)] last:border-0 align-top">
                  <td className="px-4 py-3 max-w-[360px]">
                    <p className="line-clamp-3">{row.body}</p>
                    <p className="mt-1 text-xs text-[var(--ink-tertiary)]">
                      {new Date(row.createdAt).toLocaleString('th-TH')}
                    </p>
                  </td>
                  <td className="px-4 py-3">{row.authorId}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">{row.likeCount}</td>
                  <td className="px-4 py-3">{row.reportCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
