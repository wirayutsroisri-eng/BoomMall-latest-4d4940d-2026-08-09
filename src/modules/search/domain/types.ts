export type SearchResultKind = 'official' | 'creator' | 'friend';

export type SearchResult = {
  id: string;
  /** Handle without the leading @ */
  handle: string;
  displayName: string;
  subtitle: string;
  avatarColor: string;
  kind: SearchResultKind;
  verified?: boolean;
  /** Mock phone number so the search bar can match on [เบอร์โทรศัพท์] too */
  phone?: string;
};
