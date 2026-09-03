/**
 * Pre-publish content filter.
 *
 * Apple guideline 1.2 requires "a method for filtering objectionable material
 * from being posted" — this is that gate: it runs before a post or comment is
 * stored, not after someone reports it.
 *
 * Deliberately conservative. It blocks unambiguous cases and flags the rest for
 * the moderation queue; over-blocking Thai text is worse than a queued review.
 */

export type FilterVerdict = {
  action: 'allow' | 'flag' | 'block';
  /** Machine-readable reason, e.g. 'slur', 'sexual_service', 'contact_spam'. */
  reason?: string;
  /** Message shown to the poster when blocked. */
  message?: string;
};

/** Unambiguous, non-negotiable: sexual content involving minors, hard slurs. */
const BLOCK_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: 'csam', pattern: /(เด็ก|เยาวชน|ต่ำกว่า\s*18|underage|minor)\s*(เย็ด|ขาย|บริการ|sex|nude|porn)/i },
  { reason: 'csam', pattern: /(child|teen|loli)\s*(porn|nude|sex)/i },
  { reason: 'sexual_service', pattern: /(ขายบริการ|รับงานนอก|ค้าประเวณี|นัดเย็ด)/i },
  { reason: 'drugs', pattern: /(ขาย|จำหน่าย|ส่ง)\s*(ยาบ้า|ยาไอซ์|ยาอี|เฮโรอีน|โคเคน|กัญชาแห้ง)/i },
  { reason: 'weapons', pattern: /(ขาย|จำหน่าย)\s*(ปืน|อาวุธปืน|กระสุน|ระเบิด)/i },
  { reason: 'illegal_docs', pattern: /(รับทำ|ขาย)\s*(บัตรประชาชนปลอม|วุฒิปลอม|พาสปอร์ตปลอม|สลิปปลอม)/i },
  { reason: 'gambling', pattern: /(เว็บพนัน|บาคาร่า|สล็อตออนไลน์|แทงบอลออนไลน์)/i },
];

/** Worth a human look but not worth refusing outright. */
const FLAG_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: 'self_harm', pattern: /(ฆ่าตัวตาย|อยากตาย|suicide|kill myself)/i },
  { reason: 'violence_threat', pattern: /(ฆ่ามึง|ตามไปฆ่า|จะฆ่า|kill you)/i },
  { reason: 'hate', pattern: /(ไอ้ควาย|ไอ้สัตว์|กะหรี่|ดอกทอง)/i },
  { reason: 'financial_scam', pattern: /(ลงทุน.*กำไร\s*\d+\s*%|รวยเร็ว|เทรดทองไม่เสี่ยง|ปันผลรายวัน)/i },
];

const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const PHONE_PATTERN = /(0\d{1,2}[-\s]?\d{3}[-\s]?\d{4})/g;

/** More than a few links plus a phone number is an advert, not a post. */
function looksLikeContactSpam(text: string): boolean {
  const urls = text.match(URL_PATTERN)?.length ?? 0;
  const phones = text.match(PHONE_PATTERN)?.length ?? 0;
  return urls >= 4 || (urls >= 2 && phones >= 2);
}

export function screenText(input: string | null | undefined): FilterVerdict {
  const text = (input ?? '').trim();
  if (!text) return { action: 'allow' };

  for (const rule of BLOCK_PATTERNS) {
    if (rule.pattern.test(text)) {
      return {
        action: 'block',
        reason: rule.reason,
        message: 'เนื้อหานี้ขัดกับกฎการใช้งาน จึงโพสต์ไม่ได้ หากคิดว่าเป็นความผิดพลาด ติดต่อ support@boommall.app',
      };
    }
  }

  if (looksLikeContactSpam(text)) {
    return {
      action: 'block',
      reason: 'contact_spam',
      message: 'โพสต์นี้มีลิงก์หรือเบอร์ติดต่อมากเกินไป ลองลดจำนวนลงแล้วโพสต์อีกครั้ง',
    };
  }

  for (const rule of FLAG_PATTERNS) {
    if (rule.pattern.test(text)) return { action: 'flag', reason: rule.reason };
  }

  return { action: 'allow' };
}
