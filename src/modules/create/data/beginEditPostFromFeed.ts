import { Alert } from 'react-native';
import { router } from 'expo-router';
import {
  DEFAULT_OVERLAY_TRANSFORM,
} from '@/modules/create/domain/overlay';
import { useCreateDraftStore } from '@/modules/create/state/create-draft-store';
import type { FeedItem } from '@/modules/feed/domain/types';

function parseCaptionMeta(item: FeedItem) {
  const lines = item.caption.split('\n').map((l) => l.trim()).filter(Boolean);
  let location =
    item.location && item.location !== 'จันทบุรี' ? item.location : null;
  let linkLabel: string | null = null;
  let music = item.musicTitle?.trim() || '';
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('📍')) {
      location = line.replace(/^📍\s*/, '').trim() || location;
      continue;
    }
    if (line.startsWith('🔗')) {
      linkLabel = line.replace(/^🔗\s*/, '').trim() || null;
      continue;
    }
    if (line.startsWith('🎵')) {
      music = line.replace(/^🎵\s*/, '').trim() || music;
      continue;
    }
    bodyLines.push(line);
  }

  const title = bodyLines[0] || item.overlayText?.trim() || '';
  const description = bodyLines.slice(1).join('\n');
  return { title, description, location, linkLabel, music };
}

/** Long-press own post → full TikTok-style edit (media, text, filters, publish form). */
export function beginEditPostFromFeedItem(item: FeedItem) {
  const isVideo = Boolean(item.videoUri?.trim());
  const mediaUris = isVideo
    ? [item.videoUri!]
    : item.imageUris?.length
      ? item.imageUris
      : item.imageUri
        ? [item.imageUri]
        : [];

  const uri = mediaUris[0]?.trim();
  if (!uri) {
    Alert.alert('แก้ไขไม่ได้', 'โพสต์นี้ไม่มีรูปหรือวิดีโอ');
    return;
  }

  const hasLiveOverlay = Boolean(item.overlayText?.trim());
  const { title, description, location, linkLabel, music } = parseCaptionMeta(item);

  useCreateDraftStore.getState().setDraft({
    editFeedId: item.id,
    uri,
    type: isVideo ? 'video' : 'image',
    baked: !hasLiveOverlay,
    overlayText: item.overlayText?.trim() || '',
    overlayColor: item.overlayTextColor || '#FFFFFF',
    overlayTransform: item.overlayTransform ?? { ...DEFAULT_OVERLAY_TRANSFORM },
    filter: 'none',
    sticker: '',
    music,
    mediaUris,
    publishTitle: title,
    publishDescription: description,
    publishLocation: location,
    publishLinkLabel: linkLabel,
  });

  router.push({
    pathname: '/create-publish',
    params: { type: isVideo ? 'video' : 'image', edit: '1' },
  });
}
