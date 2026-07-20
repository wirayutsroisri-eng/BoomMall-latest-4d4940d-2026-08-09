/**
 * Vision AI Slip Verifier
 * อ่านข้อมูลจากสลิปโอนเงิน และเปรียบเทียบกับข้อมูลคำสั่งซื้อ
 */
import { invokeLLM, type Message } from "./_core/llm";

export interface SlipData {
  transferDate: string | null;   // วันที่โอน เช่น "2024-07-06"
  transferTime: string | null;   // เวลาโอน เช่น "14:30"
  amount: number | null;         // ยอดเงิน (บาท)
  senderName: string | null;     // ชื่อผู้โอน
  receiverName: string | null;   // ชื่อผู้รับ
  receiverAccount: string | null; // เลขบัญชีผู้รับ (ถ้ามี)
  bankName: string | null;       // ธนาคาร
  referenceNo: string | null;    // เลขอ้างอิง
  rawText: string;               // ข้อความดิบจาก AI
}

export interface VerifyResult {
  passed: boolean;
  autoApproved: boolean;
  confidence: number; // 0-100
  slipData: SlipData;
  failReasons: string[];
  note: string;
}

/** แยก JSON จาก text ที่ AI ตอบมา (รองรับ markdown code block) */
function extractJSON(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text.trim();
}

/** อ่านข้อมูลจากรูปสลิปด้วย Vision AI */
export async function readSlipData(slipImageUrl: string): Promise<SlipData> {
  const prompt = `คุณเป็น OCR ผู้เชี่ยวชาญในการอ่านสลิปโอนเงินธนาคารไทย
กรุณาอ่านข้อมูลจากสลิปนี้และตอบเป็น JSON เท่านั้น ไม่ต้องมีข้อความอื่น

ตอบในรูปแบบ JSON นี้:
{
  "transferDate": "YYYY-MM-DD หรือ null ถ้าไม่มี",
  "transferTime": "HH:MM หรือ null ถ้าไม่มี",
  "amount": 1234.56 (ตัวเลขเท่านั้น ไม่มีเครื่องหมาย หรือ null),
  "senderName": "ชื่อผู้โอน หรือ null",
  "receiverName": "ชื่อผู้รับ หรือ null",
  "receiverAccount": "เลขบัญชีผู้รับ หรือ null",
  "bankName": "ชื่อธนาคาร หรือ null",
  "referenceNo": "เลขอ้างอิง หรือ null"
}

สำคัญ: ตอบเฉพาะ JSON เท่านั้น ไม่มีข้อความอื่น`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            { type: "image_url" as const, image_url: { url: slipImageUrl, detail: "high" as const } },
          ],
        } as Message,
      ],
    });

    const rawContent = response.choices?.[0]?.message?.content ?? "";
    const rawText = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const jsonStr = extractJSON(rawText);

    let parsed: any = {};
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.warn("[SlipVerifier] Failed to parse JSON:", jsonStr);
    }

    return {
      transferDate: parsed.transferDate ?? null,
      transferTime: parsed.transferTime ?? null,
      amount: typeof parsed.amount === "number" ? parsed.amount : null,
      senderName: parsed.senderName ?? null,
      receiverName: parsed.receiverName ?? null,
      receiverAccount: parsed.receiverAccount ?? null,
      bankName: parsed.bankName ?? null,
      referenceNo: parsed.referenceNo ?? null,
      rawText,
    };
  } catch (err) {
    console.error("[SlipVerifier] readSlipData error:", err);
    return {
      transferDate: null,
      transferTime: null,
      amount: null,
      senderName: null,
      receiverName: null,
      receiverAccount: null,
      bankName: null,
      referenceNo: null,
      rawText: String(err),
    };
  }
}

/** ตรวจสอบสลิปเทียบกับข้อมูลคำสั่งซื้อ */
export async function verifySlip(
  slipImageUrl: string,
  orderInfo: {
    totalAmount: number;         // ยอดที่ต้องโอน
    sellerBankAccountName?: string | null; // ชื่อบัญชีผู้ขาย
    sellerBankAccountNumber?: string | null; // เลขบัญชีผู้ขาย
    sellerBankName?: string | null; // ธนาคารผู้ขาย
    sellerPromptpay?: string | null; // เบอร์ PromptPay
    createdAt: Date;             // เวลาสร้างออเดอร์
  }
): Promise<VerifyResult> {
  const slipData = await readSlipData(slipImageUrl);
  const failReasons: string[] = [];
  let confidence = 0;
  let scoreTotal = 0;

  // ─── ตรวจสอบยอดเงิน (สำคัญที่สุด — 50 คะแนน) ─────────────────────────────
  if (slipData.amount !== null) {
    const diff = Math.abs(slipData.amount - orderInfo.totalAmount);
    const pct = diff / orderInfo.totalAmount;
    if (pct <= 0.01) {
      // ยอดตรง ±1%
      scoreTotal += 50;
    } else if (pct <= 0.05) {
      // ยอดใกล้เคียง ±5%
      scoreTotal += 25;
      failReasons.push(`ยอดเงินไม่ตรง: สลิป ฿${slipData.amount.toFixed(2)} แต่ต้องโอน ฿${orderInfo.totalAmount.toFixed(2)}`);
    } else {
      failReasons.push(`ยอดเงินไม่ตรง: สลิป ฿${slipData.amount.toFixed(2)} แต่ต้องโอน ฿${orderInfo.totalAmount.toFixed(2)}`);
    }
  } else {
    failReasons.push("ไม่สามารถอ่านยอดเงินจากสลิปได้");
  }

  // ─── ตรวจสอบวันที่/เวลา (30 คะแนน) ─────────────────────────────────────────
  if (slipData.transferDate) {
    const slipDate = new Date(slipData.transferDate + (slipData.transferTime ? `T${slipData.transferTime}` : "T00:00:00"));
    const orderDate = new Date(orderInfo.createdAt);
    const hoursDiff = (slipDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60);

    if (hoursDiff >= -1 && hoursDiff <= 48) {
      // โอนภายใน 48 ชั่วโมงหลังสร้างออเดอร์ (±1h เผื่อ timezone)
      scoreTotal += 30;
    } else if (hoursDiff >= -24 && hoursDiff <= 72) {
      scoreTotal += 15;
      failReasons.push(`วันที่โอนห่างจากเวลาสั่งซื้อมากกว่าปกติ (${Math.round(hoursDiff)} ชั่วโมง)`);
    } else {
      failReasons.push(`วันที่โอนไม่ตรงกับช่วงเวลาสั่งซื้อ (${Math.round(hoursDiff)} ชั่วโมง)`);
    }
  } else {
    failReasons.push("ไม่สามารถอ่านวันที่จากสลิปได้");
  }

  // ─── ตรวจสอบชื่อ/เลขบัญชีผู้รับ (20 คะแนน) ─────────────────────────────────
  const sellerName = orderInfo.sellerBankAccountName ?? "";
  const sellerAccount = orderInfo.sellerBankAccountNumber ?? "";
  const sellerPromptpay = orderInfo.sellerPromptpay ?? "";

  if (slipData.receiverAccount && sellerAccount) {
    // เปรียบเลขบัญชี (ลบ - และ space)
    const normalize = (s: string) => s.replace(/[-\s]/g, "");
    if (normalize(slipData.receiverAccount).includes(normalize(sellerAccount)) ||
        normalize(sellerAccount).includes(normalize(slipData.receiverAccount))) {
      scoreTotal += 20;
    } else if (sellerPromptpay && normalize(slipData.receiverAccount).includes(normalize(sellerPromptpay))) {
      scoreTotal += 20;
    } else {
      failReasons.push("เลขบัญชีผู้รับในสลิปไม่ตรงกับบัญชีผู้ขาย");
    }
  } else if (slipData.receiverName && sellerName) {
    // เปรียบชื่อบัญชี (fuzzy)
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "").replace(/นาง|นาย|นางสาว|น\.ส\.|mr\.|mrs\.|ms\./g, "");
    const slipNorm = normalize(slipData.receiverName);
    const sellerNorm = normalize(sellerName);
    if (slipNorm.includes(sellerNorm) || sellerNorm.includes(slipNorm) || similarity(slipNorm, sellerNorm) >= 0.7) {
      scoreTotal += 20;
    } else {
      failReasons.push(`ชื่อผู้รับในสลิป "${slipData.receiverName}" ไม่ตรงกับบัญชีผู้ขาย "${sellerName}"`);
    }
  } else {
    // ไม่มีข้อมูลเปรียบเทียบ — ให้คะแนนบางส่วน
    scoreTotal += 10;
  }

  confidence = Math.min(100, scoreTotal);

  // ─── ตัดสินผล ─────────────────────────────────────────────────────────────
  // Auto-approve ถ้า confidence >= 70 และไม่มี fail reason ที่เกี่ยวกับยอดเงิน
  const hasAmountFail = failReasons.some((r) => r.includes("ยอดเงิน"));
  const autoApproved = confidence >= 70 && !hasAmountFail;
  const passed = confidence >= 50;

  let note = "";
  if (autoApproved) {
    note = `ตรวจสอบผ่านอัตโนมัติ (ความมั่นใจ ${confidence}%)`;
  } else if (passed) {
    note = `ผ่านเกณฑ์เบื้องต้น แต่ต้องให้ Admin ยืนยัน (ความมั่นใจ ${confidence}%)`;
  } else {
    note = `ไม่ผ่านการตรวจสอบ (ความมั่นใจ ${confidence}%) — ${failReasons.join(", ")}`;
  }

  return { passed, autoApproved, confidence, slipData, failReasons, note };
}

/** Simple string similarity (Dice coefficient) */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (s: string): string[] => {
    const arr: string[] = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
    return arr;
  };
  const aArr = bigrams(a);
  const bSet = new Set(bigrams(b));
  let intersection = 0;
  for (const bg of aArr) if (bSet.has(bg)) intersection++;
  return (2 * intersection) / (aArr.length + bSet.size);
}
