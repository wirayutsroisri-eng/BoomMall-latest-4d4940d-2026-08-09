/**
 * Shared risk scoring for Trust & Safety (no store side-effects).
 */

export type RiskSignal =
  | 'spam'
  | 'scam'
  | 'harassment'
  | 'sexual_content'
  | 'violence'
  | 'illegal_goods'
  | 'impersonation'
  | 'bot_behavior'
  | 'repeat_violation';

export type RiskBand = 'Low' | 'Medium' | 'High' | 'Critical';

export type RiskBreakdown = {
  score: number;
  band: RiskBand;
  signals: Array<{ signal: RiskSignal; weight: number; contribution: number }>;
};

export function defaultWeights(): Record<RiskSignal, number> {
  return {
    spam: 12,
    scam: 18,
    harassment: 14,
    sexual_content: 16,
    violence: 16,
    illegal_goods: 20,
    impersonation: 12,
    bot_behavior: 10,
    repeat_violation: 15,
  };
}

export function bandForScore(score: number): RiskBand {
  if (score >= 85) return 'Critical';
  if (score >= 65) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

export function computeRisk(input: {
  reasons: string[];
  previousViolations?: number;
  weights?: Record<RiskSignal, number>;
}): RiskBreakdown {
  const weights = input.weights ?? defaultWeights();
  const text = input.reasons.join(' ').toLowerCase();
  const hits: RiskSignal[] = [];
  const map: Array<[RegExp, RiskSignal]> = [
    [/spam|ซ้ำ|มวล/, 'spam'],
    [/scam|หลอก|โอนเงิน|promptpay|นอกระบบ/, 'scam'],
    [/harass|คุกคาม|ด่า/, 'harassment'],
    [/sex|โป๊|18\+/, 'sexual_content'],
    [/violence|ฆ่า|ทำร้าย/, 'violence'],
    [/ยา|พนัน|illegal|ของผิดกฏหมาย/, 'illegal_goods'],
    [/ปลอม|impersonat/, 'impersonation'],
    [/bot|หุ่นยนต์/, 'bot_behavior'],
  ];
  for (const [re, signal] of map) {
    if (re.test(text)) hits.push(signal);
  }
  if ((input.previousViolations ?? 0) > 0) hits.push('repeat_violation');

  const unique = [...new Set(hits)];
  const signals = unique.map((signal) => ({
    signal,
    weight: weights[signal],
    contribution: weights[signal],
  }));
  const score = Math.min(
    100,
    signals.reduce((a, s) => a + s.contribution, 0) + (input.previousViolations ?? 0) * 5,
  );
  return { score, band: bandForScore(score), signals };
}
