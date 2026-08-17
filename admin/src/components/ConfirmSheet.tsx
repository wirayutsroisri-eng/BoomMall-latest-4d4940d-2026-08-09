import { useEffect, useState } from 'react';

export type ConfirmRequest = {
  title: string;
  effects: string[];
  confirmLabel: string;
  requireReason?: boolean;
  danger?: boolean;
};

type Props = {
  open: boolean;
  request: ConfirmRequest | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function ConfirmSheet({ open, request, busy, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open, request?.title]);

  if (!open || !request) return null;

  const blocked = Boolean(request.requireReason && !reason.trim()) || Boolean(busy);

  return (
    <div className="confirm-root" role="presentation" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="confirm-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="font-display text-xl font-extrabold tracking-tight">
          {request.title}
        </h2>
        {request.effects.length > 0 ? (
          <div className="mt-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
              ผลที่จะเกิดขึ้น
            </p>
            <ul className="mt-2 space-y-1 text-sm text-[var(--ink-secondary)]">
              {request.effects.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {request.requireReason ? (
          <label className="mt-4 block">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
              เหตุผล
            </span>
            <textarea
              className="mt-1 w-full rounded-[12px] border border-[var(--line-strong)] px-3 py-2 text-sm"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="บันทึกเหตุผลไว้ใน Audit Log"
            />
          </label>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={request.danger ? 'btn-danger' : 'btn-primary'}
            disabled={blocked}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? 'กำลังทำ…' : request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
