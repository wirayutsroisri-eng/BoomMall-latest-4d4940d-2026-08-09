import type { ChatConversation, Conversation } from '../domain/types';

/** Map a UI Conversation → ChatConversation schema used by gesture helpers. */
export function toChatConversation(c: Conversation): ChatConversation {
  return {
    chatId: c.id,
    isPinned: !!c.isPinned,
    pinnedAt: c.pinnedAt ?? null,
    isMuted: !!c.isMuted,
    isArchived: !!c.isArchived,
    unreadCount: c.unread,
  };
}

/**
 * Pure helpers for long-press / swipe gesture actions.
 * Each returns a new Conversation[] — callers wire them into the Zustand store.
 */

/** สลับสถานะปักหมุด — ไม่เรียงใหม่ (หน้าทั้งหมดคงลำดับเดิม; ดูรายการปักหมุดที่แท็บแยก) */
export function togglePinChat(conversations: Conversation[], chatId: string): Conversation[] {
  const now = Date.now();
  return conversations.map((c) => {
    if (c.id !== chatId) return c;
    const pinned = !c.isPinned;
    return {
      ...c,
      isPinned: pinned,
      pinnedAt: pinned ? now : null,
    };
  });
}

/** ปิด/เปิดการแจ้งเตือน */
export function muteChat(conversations: Conversation[], chatId: string): Conversation[] {
  return conversations.map((c) =>
    c.id === chatId ? { ...c, isMuted: !c.isMuted } : c,
  );
}

/** ซ่อน / จัดเก็บแชต */
export function archiveChat(conversations: Conversation[], chatId: string): Conversation[] {
  return conversations.map((c) =>
    c.id === chatId ? { ...c, isArchived: true } : c,
  );
}

/** ลบแชตออกจากรายการ */
export function deleteChat(conversations: Conversation[], chatId: string): Conversation[] {
  return conversations.filter((c) => c.id !== chatId);
}

/** เรียงเฉพาะรายการในแท็บปักหมุด — pinnedAt ใหม่สุดก่อน */
export function sortPinnedByRecent(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
}
