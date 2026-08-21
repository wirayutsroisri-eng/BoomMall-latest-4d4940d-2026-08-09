export const colors = {
  brand: {
    primary: '#00D68F',
    primaryDark: '#00A86B',
    ink: '#000000',
    forest: '#0B1F17',
    mist: '#E8F7F0',
    cyan: '#25F4EE',
    pink: '#FE2C55',
  },
  surface: {
    canvas: '#F4F7F5',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
    overlay: 'rgba(7, 20, 15, 0.72)',
    sheet: '#111C17',
  },
  text: {
    primary: '#0A1611',
    secondary: '#4A5C54',
    inverse: '#FFFFFF',
    muted: '#8A9A92',
    onDark: '#E8F7F0',
  },
  accent: {
    live: '#FF3B4A',
    warning: '#F5A524',
    info: '#2E8CFF',
    vault: '#C9A227',
  },
  border: {
    soft: 'rgba(10, 22, 17, 0.08)',
    strong: 'rgba(10, 22, 17, 0.16)',
    onDark: 'rgba(255, 255, 255, 0.14)',
  },
  feed: {
    gradientTop: 'rgba(7, 20, 15, 0.35)',
    gradientBottom: 'rgba(7, 20, 15, 0.85)',
    /** Minimal low-height scrim strictly behind bottom caption/author text. */
    captionScrim: 'rgba(7, 20, 15, 0.55)',
  },
} as const;
