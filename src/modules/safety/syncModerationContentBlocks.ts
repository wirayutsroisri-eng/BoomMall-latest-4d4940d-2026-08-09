import { getApiBase } from '@/modules/auth/state/auth-store';
import { useModerationStore } from '@/modules/safety/state/moderation-store';

/**
 * Pull admin takedown + banned user lists so mobile hides content in near real time.
 */
export async function syncModerationContentBlocks(): Promise<void> {
  const base = getApiBase();
  if (!base) return;

  try {
    const res = await fetch(`${base}/api/v1/moderation/content-blocks`);
    if (!res.ok) return;
    const json = (await res.json()) as {
      ok?: boolean;
      data?: {
        hiddenIds?: string[];
        removedIds?: string[];
        bannedUserIds?: string[];
      };
    };
    if (!json?.ok || !json.data) return;
    const store = useModerationStore.getState();
    store.applyServerBlocks({
      hiddenIds: json.data.hiddenIds ?? [],
      removedIds: json.data.removedIds ?? [],
    });
    for (const id of json.data.bannedUserIds ?? []) {
      store.blockUser(id);
    }
  } catch {
    // Offline — local blocks still apply
  }
}

export async function submitReportToServer(input: {
  kind: string;
  targetId: string;
  targetLabel?: string;
  reason: string;
  details?: string;
  reporterRef?: string;
}) {
  const base = getApiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/v1/moderation/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const json = await res.json();
    // If server auto-hid, sync blocks immediately
    void syncModerationContentBlocks();
    return json;
  } catch {
    return null;
  }
}

export async function scanKeywordsOnServer(input: {
  contentId: string;
  text: string;
  authorUserId?: string;
  authorHandle?: string;
}): Promise<{ quarantined?: boolean; hits?: string[] } | null> {
  const base = getApiBase();
  if (!base) {
    const LOCAL_KEYWORDS = ['ยาเสพติด', 'พนันออนไลน์', 'หลอกลวงโอนเงิน', 'porn', 'sex for sale'];
    const hay = input.text.toLowerCase();
    const hits = LOCAL_KEYWORDS.filter((k) => hay.includes(k.toLowerCase()));
    if (hits.length) {
      useModerationStore.getState().hideContent(input.contentId);
      return { quarantined: true, hits };
    }
    return { quarantined: false, hits: [] };
  }
  try {
    const res = await fetch(`${base}/api/v1/moderation/keywords/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.data?.quarantined) {
      useModerationStore.getState().hideContent(input.contentId);
    }
    return json?.data ?? null;
  } catch {
    return null;
  }
}
