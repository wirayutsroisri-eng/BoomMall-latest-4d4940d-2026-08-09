/** Placeholder titles that were auto-filled even when the user never picked a sound. */
const PLACEHOLDER_MUSIC_RE =
  /hey\s*chop\s*te|original sound\s*[—–-]\s*boommall|^original sound$|workshop vibes/i;

export function isPlaceholderMusicText(value?: string | null): boolean {
  const t = (value ?? '').trim();
  if (!t) return false;
  return PLACEHOLDER_MUSIC_RE.test(t);
}

export function hasFeedMusic(title?: string | null): boolean {
  const t = title?.trim() ?? '';
  if (!t) return false;
  return !isPlaceholderMusicText(t);
}

export function sanitizeMusicTitle(title?: string | null): string {
  return hasFeedMusic(title) ? (title ?? '').trim() : '';
}

export function stripFakeMusicCaption(caption?: string | null): string {
  const stripped = (caption ?? '')
    .replace(/🎵[^\n]*/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !isPlaceholderMusicText(line))
    .join('\n')
    .trim();
  if (isPlaceholderMusicText(stripped)) return '';
  return stripped;
}
