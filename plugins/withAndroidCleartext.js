const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Android 9+ blocks cleartext HTTP unless the app opts in. iOS already relaxes
 * ATS for HTTP/LAN dev (see app.config.ts); without the matching Android flag a
 * physical Android device cannot reach the `http://` LAN dev API while iOS/Web
 * can, and the inventory pull fails with a generic network error.
 *
 * HTTPS production APIs stay strict (`usesCleartextTraffic=false`).
 */
function withAndroidCleartext(config) {
  return withAndroidManifest(config, (config) => {
    const extra = config.extra && typeof config.extra === 'object' ? config.extra : {};
    const configured =
      typeof extra.androidCleartextTraffic === 'boolean'
        ? extra.androidCleartextTraffic
        : !(process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_URL || '')
            .trim()
            .startsWith('https://');

    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = configured ? 'true' : 'false';
    }
    return config;
  });
}

module.exports = withAndroidCleartext;
