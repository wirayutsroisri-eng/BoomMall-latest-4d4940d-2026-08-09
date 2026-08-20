import { Platform, type TextStyle } from 'react-native';

/** Kwai-like profile typography — system sans, neutral black/gray hierarchy. */
export const profileInk = {
  primary: '#111111',
  secondary: '#666666',
  muted: '#999999',
} as const;

const systemSans = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

export const profileType: Record<
  'displayName' | 'statValue' | 'statLabel' | 'handle' | 'bio' | 'addBio' | 'category',
  TextStyle
> = {
  displayName: {
    fontFamily: systemSans,
    fontSize: 25,
    fontWeight: '600',
    color: profileInk.primary,
    letterSpacing: 0.2,
    lineHeight: 30,
  },
  statValue: {
    fontFamily: systemSans,
    fontSize: 23,
    fontWeight: '700',
    color: profileInk.primary,
    letterSpacing: -0.2,
    lineHeight: 28,
  },
  statLabel: {
    fontFamily: systemSans,
    fontSize: 12,
    fontWeight: '400',
    color: profileInk.secondary,
    lineHeight: 16,
  },
  handle: {
    fontFamily: systemSans,
    fontSize: 11,
    fontWeight: '400',
    color: profileInk.secondary,
  },
  bio: {
    fontFamily: systemSans,
    fontSize: 14,
    fontWeight: '400',
    color: profileInk.primary,
    lineHeight: 20,
  },
  addBio: {
    fontFamily: systemSans,
    fontSize: 13,
    fontWeight: '500',
    color: profileInk.secondary,
  },
  category: {
    fontFamily: systemSans,
    fontSize: 11,
    fontWeight: '400',
    color: profileInk.muted,
  },
};
