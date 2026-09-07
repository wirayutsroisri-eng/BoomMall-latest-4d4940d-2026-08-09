const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * app.json's `locales.th` only carries iOS-only keys (CFBundleDisplayName /
 * CFBundleName). Expo's locale plugin still emits them into
 * android/app/src/main/res/values-b+th/strings.xml, and since no default
 * (values/strings.xml) counterpart exists, Android's release lint
 * (lintVitalRelease) fails the build with a fatal "ExtraTranslation" error.
 * These keys don't apply to Android at all, so disable just that check.
 */
function withAndroidLintFix(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withAndroidLintFix expects a Groovy app/build.gradle');
    }
    if (!config.modResults.contents.includes("disable 'ExtraTranslation'")) {
      config.modResults.contents = config.modResults.contents.replace(
        /android\s*\{/,
        `android {\n    lint {\n        disable 'ExtraTranslation'\n    }\n`,
      );
    }
    return config;
  });
}

module.exports = withAndroidLintFix;
