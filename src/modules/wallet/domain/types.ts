export type CoinTxKind = 'tip_sent' | 'topup';

export type CoinTransaction = {
  id: string;
  kind: CoinTxKind;
  amount: number;
  /** ยอดคงเหลือหลังรายการนี้ */
  balanceAfter: number;
  feedId?: string;
  toHandle?: string;
  toName?: string;
  note: string;
  createdAt: number;
};

export const TIP_PRESETS = [1, 5, 10, 50, 100] as const;
export const TOPUP_PRESETS = [50, 100, 300, 500] as const;
