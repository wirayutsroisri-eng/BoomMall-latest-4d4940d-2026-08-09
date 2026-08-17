import { Linking } from 'react-native';
import { router } from 'expo-router';
import { getLegalUrl, type LegalDocKey } from './legalUrls';

/** Opens the hosted HTTPS policy in Safari when configured; otherwise the in-app copy. */
export async function openLegalDocument(doc: LegalDocKey) {
  const url = getLegalUrl(doc);
  if (url) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      /* fall through to in-app */
    }
  }
  router.push({ pathname: '/legal/[doc]', params: { doc } });
}
