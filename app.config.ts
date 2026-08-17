import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Locked for every EAS / prebuild — do not read these from env. */
const DISPLAY_NAME = 'BoomMall';
const BUNDLE_IDENTIFIER = 'com.boommall.superapp';

function googleReversedClientId(clientId?: string) {
  const id = clientId?.trim();
  if (!id) return null;
  const prefix = id.replace(/\.apps\.googleusercontent\.com$/i, '');
  if (!prefix || prefix === id) return null;
  return `com.googleusercontent.apps.${prefix}`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const facebookAppId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim();
  const googleIosClientId =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ||
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const googleScheme = googleReversedClientId(googleIosClientId);

  const existingSchemes = (config.ios?.infoPlist?.LSApplicationQueriesSchemes as string[] | undefined) ?? [];
  const querySchemes = Array.from(
    new Set([
      ...existingSchemes,
      'fbapi',
      'fb-messenger-share-api',
      'fbauth2',
      'fbshareextension',
    ]),
  );

  const existingUrlTypes = Array.isArray(config.ios?.infoPlist?.CFBundleURLTypes)
    ? (config.ios?.infoPlist?.CFBundleURLTypes as Array<{ CFBundleURLSchemes?: string[] }>)
    : [];
  const urlTypes = [
    ...existingUrlTypes,
    { CFBundleURLSchemes: ['boommall'] },
    ...(facebookAppId ? [{ CFBundleURLSchemes: [`fb${facebookAppId}`] }] : []),
    ...(googleScheme ? [{ CFBundleURLSchemes: [googleScheme] }] : []),
  ];

  return {
    ...config,
    name: DISPLAY_NAME,
    slug: config.slug ?? 'wirayut',
    ios: {
      ...config.ios,
      bundleIdentifier: BUNDLE_IDENTIFIER,
      usesAppleSignIn: true,
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleDisplayName: DISPLAY_NAME,
        CFBundleName: DISPLAY_NAME,
        CFBundleDevelopmentRegion: 'th',
        CFBundleAllowMixedLocalizations: true,
        CFBundleLocalizations: ['th', 'en'],
        NSCameraUsageDescription:
          'BoomMall ใช้กล้องเพื่อถ่ายรูปสินค้า สแกนบาร์โค้ดคลัง โพสต์คอนเทนต์ และแนบรูปในแชต',
        NSMicrophoneUsageDescription:
          'BoomMall ใช้ไมโครโฟนเพื่อบันทึกวอยซ์โน้ตในแชตและคลิปเสียงประกอบคอนเทนต์',
        NSPhotoLibraryUsageDescription:
          'BoomMall ใช้คลังภาพเพื่อแนบรูปและวิดีโอสินค้า โพสต์คอนเทนต์ และแนบสื่อในแชต',
        NSPhotoLibraryAddUsageDescription:
          'BoomMall บันทึกรูปที่คุณเลือกหรือสร้างลงคลังภาพเมื่อคุณอนุญาต',
        LSApplicationQueriesSchemes: querySchemes,
        CFBundleURLTypes: urlTypes,
        ...(facebookAppId
          ? {
              FacebookAppID: facebookAppId,
              FacebookDisplayName: DISPLAY_NAME,
              FacebookAutoLogAppEventsEnabled: false,
              FacebookAdvertiserIDCollectionEnabled: false,
            }
          : {}),
        ...(googleIosClientId ? { GIDClientID: googleIosClientId } : {}),
      },
    },
    android: {
      ...config.android,
      package: BUNDLE_IDENTIFIER,
    },
    extra: {
      ...(typeof config.extra === 'object' && config.extra ? config.extra : {}),
      facebookAppId: facebookAppId || undefined,
      googleIosClientId: googleIosClientId || undefined,
      apiUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || undefined,
      devApiHost: process.env.EXPO_PUBLIC_DEV_API_HOST?.trim() || undefined,
    },
  };
};
