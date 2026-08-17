/** 06:00–17:59 local = day. Night uses the dark inbox. */
export function isDaylightHours(date = new Date()) {
  const hour = date.getHours();
  return hour >= 6 && hour < 18;
}

export type ChatInboxPalette = {
  canvas: string;
  searchBg: string;
  searchText: string;
  searchPlaceholder: string;
  searchBorder: string;
  addIcon: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  chipActiveBg: string;
  chipActiveText: string;
  name: string;
  preview: string;
  time: string;
  sep: string;
  empty: string;
  pinBadgeBg: string;
  groupDotBorder: string;
  muteIcon: string;
  noteLabel: string;
  noteAdd: string;
  noteBadgeBorder: string;
};

export const CHAT_INBOX_DAY: ChatInboxPalette = {
  canvas: '#FFFFFF',
  searchBg: '#E5E5EA',
  searchText: '#000000',
  searchPlaceholder: 'rgba(60, 60, 67, 0.55)',
  searchBorder: 'transparent',
  addIcon: '#000000',
  chipBg: '#E5E5EA',
  chipBorder: 'transparent',
  chipText: 'rgba(60, 60, 67, 0.82)',
  chipActiveBg: '#000000',
  chipActiveText: '#FFFFFF',
  name: '#000000',
  preview: 'rgba(60, 60, 67, 0.64)',
  time: 'rgba(60, 60, 67, 0.48)',
  sep: 'rgba(60, 60, 67, 0.16)',
  empty: 'rgba(60, 60, 67, 0.45)',
  pinBadgeBg: '#FFFFFF',
  groupDotBorder: '#FFFFFF',
  muteIcon: 'rgba(60, 60, 67, 0.45)',
  noteLabel: 'rgba(60, 60, 67, 0.72)',
  noteAdd: '#000000',
  noteBadgeBorder: '#FFFFFF',
};

export const CHAT_INBOX_NIGHT: ChatInboxPalette = {
  canvas: '#000000',
  searchBg: '#1C1C1E',
  searchText: '#FFFFFF',
  searchPlaceholder: 'rgba(255,255,255,0.4)',
  searchBorder: 'rgba(255, 255, 255, 0.14)',
  addIcon: '#FFFFFF',
  chipBg: '#1C1C1E',
  chipBorder: 'rgba(255, 255, 255, 0.14)',
  chipText: 'rgba(255,255,255,0.72)',
  chipActiveBg: '#FFFFFF',
  chipActiveText: '#000000',
  name: '#FFFFFF',
  preview: 'rgba(255,255,255,0.55)',
  time: 'rgba(255,255,255,0.45)',
  sep: 'rgba(255, 255, 255, 0.14)',
  empty: 'rgba(255,255,255,0.45)',
  pinBadgeBg: '#000000',
  groupDotBorder: '#000000',
  muteIcon: 'rgba(255,255,255,0.45)',
  noteLabel: 'rgba(255,255,255,0.72)',
  noteAdd: '#FFFFFF',
  noteBadgeBorder: '#000000',
};

export function chatInboxPalette(day = isDaylightHours()): ChatInboxPalette {
  return day ? CHAT_INBOX_DAY : CHAT_INBOX_NIGHT;
}
