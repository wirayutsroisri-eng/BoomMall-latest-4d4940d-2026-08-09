import { Linking, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { FeedItem } from './types';

export const FEED_SHARE_HOST = 'https://boommall.app';

export type FeedShareChannel = 'line' | 'messenger' | 'whatsapp' | 'facebook' | 'copy' | 'more';

export type FeedShareResult = 'shared' | 'copied' | 'dismissed';

export function feedShareHandle(item: FeedItem) {
  return item.authorHandle.replace(/^@/, '');
}

export function buildFeedShareUrl(item: FeedItem) {
  const handle = encodeURIComponent(feedShareHandle(item));
  const feedId = encodeURIComponent(item.id);
  return `${FEED_SHARE_HOST}/creator/${handle}?feedId=${feedId}`;
}

export function buildFeedShareText(item: FeedItem) {
  const caption = item.caption?.trim() || 'คลิปจาก BoomMall';
  return `${item.author} บน BoomMall\n${caption}`;
}

export async function shareFeedNative(item: FeedItem): Promise<FeedShareResult> {
  const url = buildFeedShareUrl(item);
  const message = buildFeedShareText(item);
  const result = await Share.share(
    Platform.OS === 'ios'
      ? { title: item.author, url, message }
      : { title: item.author, message: `${message}\n${url}` },
  );
  return result.action === Share.sharedAction ? 'shared' : 'dismissed';
}

async function openOrFallback(url: string, item: FeedItem): Promise<FeedShareResult> {
  try {
    const can = await Linking.canOpenURL(url);
    if (can) {
      await Linking.openURL(url);
      return 'shared';
    }
  } catch {
    /* fall through to system sheet */
  }
  return shareFeedNative(item);
}

export async function shareFeedToChannel(
  item: FeedItem,
  channel: FeedShareChannel,
): Promise<FeedShareResult> {
  const url = buildFeedShareUrl(item);
  const packed = `${buildFeedShareText(item)}\n${url}`;

  if (channel === 'copy') {
    await Clipboard.setStringAsync(url);
    return 'copied';
  }
  if (channel === 'more') {
    return shareFeedNative(item);
  }
  if (channel === 'line') {
    return openOrFallback(`https://line.me/R/share?text=${encodeURIComponent(packed)}`, item);
  }
  if (channel === 'whatsapp') {
    return openOrFallback(`https://wa.me/?text=${encodeURIComponent(packed)}`, item);
  }
  if (channel === 'facebook') {
    return openOrFallback(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      item,
    );
  }
  const messenger = `fb-messenger://share/?link=${encodeURIComponent(url)}`;
  try {
    if (await Linking.canOpenURL(messenger)) {
      await Linking.openURL(messenger);
      return 'shared';
    }
  } catch {
    /* Messenger not installed — system sheet still lets the user pick it */
  }
  return shareFeedNative(item);
}
