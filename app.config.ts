import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Locked for every EAS / prebuild — do not read these from env. */
const DISPLAY_NAME = 'BoomMall';
const BUNDLE_IDENTIFIER = 'com.boommall.superapp';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: DISPLAY_NAME,
  ios: {
    ...config.ios,
    bundleIdentifier: BUNDLE_IDENTIFIER,
    infoPlist: {
      ...config.ios?.infoPlist,
      CFBundleDisplayName: DISPLAY_NAME,
      CFBundleName: DISPLAY_NAME,
    },
  },
  android: {
    ...config.android,
    package: BUNDLE_IDENTIFIER,
  },
});
