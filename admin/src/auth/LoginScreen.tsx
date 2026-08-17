import { useState } from 'react';
import { useAdminAuth } from './AdminAuthContext';

type Props = { redirectTo?: string };

export function LoginScreen({ redirectTo }: Props) {
  const { login, error, actor } = useAdminAuth();
  const [key, setKey] = useState('');
  const [name, setName] = useState(actor);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await login(key, name);
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-[420px] rounded-[24px] border border-[var(--line)] bg-white p-8 shadow-[var(--shadow-md)]"
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
          BoomMall Admin OS
        </p>
        <h1 className="font-display mt-2 text-[1.85rem] font-extrabold tracking-tight text-[var(--ink)]">
          เข้าสู่ระบบหลังบ้าน
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-secondary)]">
          ระบบแอดมินชุดเดียว แยกจากแอปมือถือ — ตอนนี้ใช้มาสเตอร์คีย์เข้าทั้งระบบได้ก่อน
          {redirectTo?.includes('handbook') ? ' · คู่มือจำกัดสิทธิ์การเงิน/แพลตฟอร์ม' : ''}
        </p>

        <label className="mt-7 block text-xs font-semibold text-[var(--ink-tertiary)]">
          รหัสเข้าถึง
          <input
            type="password"
            autoComplete="current-password"
            className="mt-1.5 w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--bg)] px-3.5 py-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="มาสเตอร์คีย์ หรือรหัสแผนก"
            required
          />
        </label>

        <label className="mt-4 block text-xs font-semibold text-[var(--ink-tertiary)]">
          ชื่อผู้ใช้ (Audit Log)
          <input
            className="mt-1.5 w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--bg)] px-3.5 py-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อที่บันทึกใน log"
          />
        </label>

        {error ? (
          <div className="mt-4 rounded-[12px] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-2.5 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        <ul className="mt-5 space-y-1 text-[12px] leading-relaxed text-[var(--ink-tertiary)]">
          <li>มาสเตอร์คีย์ — ทั้งระบบ (ใช้ก่อน แยกแผนกทีหลัง)</li>
          <li>แพลตฟอร์ม — ทุกแผนกยกเว้น emergency</li>
          <li>Safety · Ads · Feed · ร้านค้า · การเงิน — เห็นเฉพาะงานของแผนก</li>
        </ul>

        <button
          type="submit"
          disabled={busy || !key.trim()}
          className="btn-primary mt-7 w-full !py-3.5"
        >
          {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}
