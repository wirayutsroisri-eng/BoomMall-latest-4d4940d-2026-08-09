const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Feed screens can keep several ExoPlayer instances alive at once (multiple
 * lanes/tabs), and picking media adds another decoder session on top. That
 * pushed the default ~256MB Dalvik heap into OutOfMemoryError crashes on
 * real devices. `largeHeap` raises the ceiling — it doesn't fix the root
 * leak, but removes this crash mode as a possibility.
 */
function withAndroidLargeHeap(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:largeHeap'] = 'true';
    }
    return config;
  });
}

module.exports = withAndroidLargeHeap;
