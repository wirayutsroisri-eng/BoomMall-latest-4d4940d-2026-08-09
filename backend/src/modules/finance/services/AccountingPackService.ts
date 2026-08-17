/** สรุปการเงินสำหรับส่งฝ่ายบัญชี — ตัวเลขจาก escrow + สมุดคู่ ไม่เคลมว่าโอนแล้ว */
import { getPlatformBooks } from '../../ecommerce/SettlementService';
import { getTaxSummary } from '../FinanceService';
import { splitGpVatInclusive } from '../domain/taxMath';
import { getPlatformRevenue } from './EscrowService';
import { getPlatformSettings } from './PlatformSettingsService';

export async function getAccountingPack() {
  const [settings, revenue, books, tax] = await Promise.all([
    getPlatformSettings(),
    getPlatformRevenue(),
    getPlatformBooks(),
    getTaxSummary(),
  ]);
  const generatedAt = new Date().toISOString();
  const gpVat = splitGpVatInclusive(revenue.commissionEarned);
  return {
    title: 'สรุปการเงิน BoomMall สำหรับฝ่ายบัญชี',
    generatedAt,
    currency: 'THB',
    receivingAccount: settings.bankAccount,
    escrowRules: {
      defaultGpPercent: settings.defaultGpPercent,
      autoCompleteDays: settings.autoCompleteDays,
    },
    lines: [
      { code: 'GMV', label: 'ยอดขายที่ลูกค้าชำระเข้าแพลตฟอร์ม', amount: books.cashThb || revenue.gmvHeldOrReleased },
      { code: 'GP', label: 'รายได้ค่า GP รวม VAT', amount: gpVat.gpInclusive },
      { code: 'GP_EX_VAT', label: 'รายได้ GP ก่อน VAT (ฐานภาษี)', amount: gpVat.taxBase },
      { code: 'VAT_ON_GP', label: 'ภาษีขาย 7% จากค่า GP', amount: gpVat.outputVat },
      { code: 'WHT', label: 'WHT 3% หัก ณ ที่จ่าย (นิติบุคคล)', amount: tax.whtAmount },
      { code: 'HELD', label: 'ยอดร้านที่ยังพัก (escrow)', amount: books.merchantHeldThb },
      { code: 'PAYABLE', label: 'ยอดร้านถึงรอบจ่าย', amount: books.merchantPayableThb },
      { code: 'QUEUED', label: 'ยอดร้านอยู่ในคิวโอน', amount: books.merchantQueuedThb },
      { code: 'REFUND', label: 'หนี้คืนเงินผู้ซื้อ', amount: books.buyerRefundLiabilityThb },
    ],
    counts: {
      ordersInEscrow: revenue.ordersInEscrow,
      pendingWithdrawals: tax.pendingWithdrawals.count,
    },
    note: 'ยอดคิวโอนยังไม่ใช่การโอนเข้าบัญชีร้านสำเร็จ จนกว่ามีหลักฐานโอน (proofOfTransfer)',
  };
}
