import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReportTargetKind = 'user' | 'content' | 'message' | 'comment';

export type ContentReport = {
  id: string;
  kind: ReportTargetKind;
  targetId: string;
  targetLabel?: string;
  reason: string;
  details?: string;
  createdAt: number;
  status: 'open' | 'reviewed' | 'actioned' | 'dismissed';
  resolution?: 'content_hidden' | 'content_removed' | 'dismissed' | 'reviewed';
};

type ModerationState = {
  blockedUserIds: string[];
  /** Soft-block: hidden from feed but recoverable */
  hiddenContentIds: string[];
  /** Hard remove from feed */
  removedContentIds: string[];
  reports: ContentReport[];
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  isBlocked: (userId: string) => boolean;
  hideContent: (contentId: string) => void;
  removeContent: (contentId: string) => void;
  restoreContent: (contentId: string) => void;
  isContentSuppressed: (contentId: string) => boolean;
  submitReport: (input: {
    kind: ReportTargetKind;
    targetId: string;
    targetLabel?: string;
    reason: string;
    details?: string;
  }) => ContentReport;
  /** Moderator action from in-app queue or after syncing admin decision */
  resolveReport: (
    reportId: string,
    action: 'hide_content' | 'remove_content' | 'dismiss' | 'mark_reviewed',
  ) => void;
  /** Merge server block lists (admin takedown sync) */
  applyServerBlocks: (input: { hiddenIds: string[]; removedIds: string[] }) => void;
};

export const REPORT_REASONS = [
  'สแปมหรือหลอกลวง',
  'เนื้อหาไม่เหมาะสม',
  'การคุกคามหรือกลั่นแกล้ง',
  'ละเมิดลิขสิทธิ์',
  'อื่นๆ',
] as const;

function uniqPush(list: string[], id: string) {
  return list.includes(id) ? list : [...list, id];
}

export const useModerationStore = create<ModerationState>()(
  persist(
    (set, get) => ({
      blockedUserIds: [],
      hiddenContentIds: [],
      removedContentIds: [],
      reports: [],
      blockUser: (userId) => {
        const id = userId.trim().toLowerCase();
        if (!id) return;
        set((s) =>
          s.blockedUserIds.includes(id)
            ? s
            : { blockedUserIds: [...s.blockedUserIds, id] },
        );
      },
      unblockUser: (userId) => {
        const id = userId.trim().toLowerCase();
        set((s) => ({
          blockedUserIds: s.blockedUserIds.filter((x) => x !== id),
        }));
      },
      isBlocked: (userId) => {
        const id = userId.trim().toLowerCase();
        return get().blockedUserIds.includes(id);
      },
      hideContent: (contentId) => {
        const id = contentId.trim();
        if (!id) return;
        set((s) => ({
          hiddenContentIds: uniqPush(s.hiddenContentIds, id),
          removedContentIds: s.removedContentIds.filter((x) => x !== id),
        }));
      },
      removeContent: (contentId) => {
        const id = contentId.trim();
        if (!id) return;
        set((s) => ({
          removedContentIds: uniqPush(s.removedContentIds, id),
          hiddenContentIds: s.hiddenContentIds.filter((x) => x !== id),
        }));
      },
      restoreContent: (contentId) => {
        const id = contentId.trim();
        set((s) => ({
          hiddenContentIds: s.hiddenContentIds.filter((x) => x !== id),
          removedContentIds: s.removedContentIds.filter((x) => x !== id),
        }));
      },
      isContentSuppressed: (contentId) => {
        const id = contentId.trim();
        const s = get();
        return s.hiddenContentIds.includes(id) || s.removedContentIds.includes(id);
      },
      submitReport: ({ kind, targetId, targetLabel, reason, details }) => {
        const report: ContentReport = {
          id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          kind,
          targetId,
          targetLabel,
          reason,
          details,
          createdAt: Date.now(),
          status: 'open',
        };
        set((s) => ({ reports: [report, ...s.reports].slice(0, 200) }));
        return report;
      },
      resolveReport: (reportId, action) => {
        set((s) => {
          const report = s.reports.find((r) => r.id === reportId);
          if (!report) return s;

          let hiddenContentIds = s.hiddenContentIds;
          let removedContentIds = s.removedContentIds;
          let status: ContentReport['status'] = 'reviewed';
          let resolution: ContentReport['resolution'] = 'reviewed';

          if (action === 'hide_content') {
            hiddenContentIds = uniqPush(hiddenContentIds, report.targetId);
            removedContentIds = removedContentIds.filter((x) => x !== report.targetId);
            status = 'actioned';
            resolution = 'content_hidden';
          } else if (action === 'remove_content') {
            removedContentIds = uniqPush(removedContentIds, report.targetId);
            hiddenContentIds = hiddenContentIds.filter((x) => x !== report.targetId);
            status = 'actioned';
            resolution = 'content_removed';
          } else if (action === 'dismiss') {
            status = 'dismissed';
            resolution = 'dismissed';
          }

          return {
            hiddenContentIds,
            removedContentIds,
            reports: s.reports.map((r) =>
              r.id === reportId ? { ...r, status, resolution } : r,
            ),
          };
        });
      },
      applyServerBlocks: ({ hiddenIds, removedIds }) => {
        set((s) => ({
          hiddenContentIds: Array.from(new Set([...s.hiddenContentIds, ...hiddenIds])),
          removedContentIds: Array.from(new Set([...s.removedContentIds, ...removedIds])),
        }));
      },
    }),
    {
      name: 'boommall-moderation-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        blockedUserIds: s.blockedUserIds,
        hiddenContentIds: s.hiddenContentIds,
        removedContentIds: s.removedContentIds,
        reports: s.reports,
      }),
    },
  ),
);
