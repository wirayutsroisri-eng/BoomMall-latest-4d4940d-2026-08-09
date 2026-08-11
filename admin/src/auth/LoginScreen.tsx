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
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md rounded-3xl border border-[#122820]/10 bg-white/90 p-8 shadow-lg backdrop-blur"
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#00a86b]">
          BoomMall Internal
        </p>
        <h1 className="font-display mt-2 text-3xl font-extrabold text-[#0b1f17]">
          Admin Portal
        </h1>
        <p className="mt-2 text-sm text-[#122820]/70">
          เข้าสู่ระบบด้วย Admin API Key — สิทธิ์ <strong>ADMIN</strong> เท่านั้น
          {redirectTo?.includes('handbook')
            ? ' (คู่มือ Boom Coin จำกัดสิทธิ์ ADMIN)'
            : ''}
        </p>

        <label className="mt-6 block text-xs font-semibold text-[#122820]/60">
          Admin API Key
          <input
            type="password"
            autoComplete="current-password"
            className="mt-1 w-full rounded-xl border border-[#122820]/15 px-3 py-2.5 text-sm"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ADMIN_API_KEY"
            required
          />
        </label>

        <label className="mt-4 block text-xs font-semibold text-[#122820]/60">
          ชื่อผู้ใช้ (สำหรับ Audit Log)
          <input
            className="mt-1 w-full rounded-xl border border-[#122820]/15 px-3 py-2.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="admin"
          />
        </label>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy || !key.trim()}
          className="mt-6 w-full rounded-xl bg-[#122820] py-3 text-sm font-bold text-white hover:bg-[#0b1f17] disabled:opacity-50"
        >
          {busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ ADMIN'}
        </button>
      </form>
    </div>
  );
}
