export type SearchResultKind = 'official' | 'creator' | 'friend';

import type { TrustInfo } from '@/shared/components/TrustBadge';

export type SearchResult = {
  id: string;
  userId?: string;
  friendCode?: string;
  /** Handle without the leading @ */
  handle: string;
  displayName: string;
  subtitle: string;
  avatarColor: string;
  kind: SearchResultKind;
  verified?: boolean;
  trust?: TrustInfo | null;
  /** Mock phone number so the search bar can match on [เบอร์โทรศัพท์] too */
  phone?: string;
  avatarUrl?: string | null;
};
