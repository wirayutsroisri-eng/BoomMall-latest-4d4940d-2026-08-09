import { fetchModerationStats, fetchSellerWithdrawals } from './api';
import { fetchSafetyOverview } from './safetyApi';

export type AdminNotice = {
  id: string;
  tone: 'high' | 'mid' | 'low';
  title: string;
  to: string;
  count: number;
};

export async function loadAdminNotices(): Promise<AdminNotice[]> {
  const [mod, safety, wd] = await Promise.all([
    fetchModerationStats().catch(() => null),
    fetchSafetyOverview().catch(() => null),
    fetchSellerWithdrawals().catch(() => null),
  ]);
  const next: AdminNotice[] = [];
  const scam = safety?.data.scamAlerts ?? 0;
  const chat = safety?.data.chatAbuseAlerts ?? 0;
  const critical = safety?.data.criticalCases ?? 0;
  const reports = mod?.data.openReports ?? safety?.data.newReports ?? 0;
  const pendingReview = safety?.data.pendingReview ?? 0;
  const pendingWd = (wd?.data ?? []).filter((r) => String(r.status).toLowerCase().includes('pend')).length;

  if (scam > 0) {
    next.push({
      id: 'scam',
      tone: 'high',
      title: 'ความเสี่ยงสแกมในแชต / รายงาน',
      count: scam,
      to: '/safety/chat/reports',
    });
  }
  if (critical > 0) {
    next.push({
      id: 'crit',
      tone: 'high',
      title: 'เคสร้ายแรงรอตัดสิน',
      count: critical,
      to: '/safety/cases',
    });
  }
  if (pendingWd > 0) {
    next.push({
      id: 'payout',
      tone: 'high',
      title: 'การถอนเงินรอตรวจ',
      count: pendingWd,
      to: '/finance?focus=payout',
    });
  }
  if (reports > 0) {
    next.push({
      id: 'rep',
      tone: 'mid',
      title: 'โพสต์ / บัญชีถูกรายงาน',
      count: reports,
      to: '/safety/reports',
    });
  }
  if (chat > 0) {
    next.push({
      id: 'chat',
      tone: 'mid',
      title: 'แชตถูกรายงาน',
      count: chat,
      to: '/safety/chat/reports',
    });
  }
  if (pendingReview > 0) {
    next.push({
      id: 'mod',
      tone: 'low',
      title: 'คอนเทนต์รอตรวจ',
      count: pendingReview,
      to: '/safety/content',
    });
  }
  return next;
}
