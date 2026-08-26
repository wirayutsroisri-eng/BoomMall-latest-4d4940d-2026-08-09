import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { apiGetOwnProfile, apiUpsertProfile } from '@/modules/social/data/socialApi';
import { uploadFeedMedia } from '@/modules/feed/data/uploadFeedMedia';
import { persistCreateMedia } from '@/modules/create/data/persistCreateMedia';
import { isRemoteMediaUrl } from '@/modules/chat/data/chatMedia';
import { MediaUploadError } from '@/modules/media/data/mediaAssetApi';

function asHttp(uri?: string | null) {
  const u = uri?.trim() ?? '';
  return /^https?:\/\//i.test(u) ? u : '';
}

async function uploadProfilePhoto(uri: string) {
  try {
    const uploaded = await uploadFeedMedia({ imageUris: [uri] });
    return uploaded.imageUris[0] || uri;
  } catch (error) {
    // Local development may intentionally run without S3/R2. The authenticated
    // backend media endpoint persists the file on the API server and returns a
    // stable HTTP URL, so profile photos still survive reload/app restart.
    if (!(error instanceof MediaUploadError) || error.statusCode !== 501) throw error;
    const base = getApiBase();
    if (!base) throw error;
    const file = new File(uri);
    if (!file.exists) throw new Error('PROFILE_PHOTO_FILE_MISSING');
    const mimeType = file.type || 'image/jpeg';
    const response = await expoFetch(`${base}/api/v1/chat-domain/media`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': mimeType,
        'x-mime-type': mimeType,
        'x-filename': file.name || `profile-${Date.now()}.jpg`,
      }),
      body: file,
    });
    const json = await response.json().catch(() => null) as {
      data?: { url?: string };
      error?: { message?: string };
    } | null;
    const remote = asHttp(json?.data?.url);
    if (!response.ok || !remote) {
      throw new Error(json?.error?.message || `PROFILE_PHOTO_UPLOAD_FAILED_${response.status}`);
    }
    return remote;
  }
}

export async function saveProfilePhoto(kind: 'avatar' | 'cover', uri: string) {
  const stable = await persistCreateMedia(uri, 'image');
  const remote = await uploadProfilePhoto(stable);
  if (kind === 'cover') {
    await apiUpsertProfile({ coverUrl: asHttp(remote) || undefined });
    useLoyaltyStore.getState().updateProfile({ coverUri: remote });
  } else {
    await apiUpsertProfile({ avatarUrl: asHttp(remote) || undefined });
    useLoyaltyStore.getState().updateProfile({ avatarUri: remote });
  }
  return remote;
}

export async function hydrateOwnProfileFromServer() {
  const user = useAuthStore.getState().user;
  if (!user?.id) return;
  const remote = await apiGetOwnProfile();
  if (!remote?.displayName?.trim()) {
    throw new Error('ไม่พบข้อมูลโปรไฟล์จริงของบัญชีนี้ในฐานข้อมูล');
  }
  const remoteAvatar = asHttp(remote.avatarUrl);
  const remoteCover = asHttp(remote.coverUrl);
  const current = useLoyaltyStore.getState().profile;
  useLoyaltyStore.getState().updateProfile({
    displayName: remote.displayName.trim(),
    handle: remote.handle?.trim() || '',
    bio: remote.bio ?? '',
    // A partial/legacy backend profile must not erase a valid local photo.
    avatarUri: remoteAvatar || current.avatarUri || null,
    coverUri: remoteCover || current.coverUri || null,
  });
}

export async function syncLocalProfilePhotosIfNeeded() {
  const profile = useLoyaltyStore.getState().profile;
  const patch: { avatarUrl?: string; coverUrl?: string } = {};
  if (profile.avatarUri && !isRemoteMediaUrl(profile.avatarUri)) {
    const uploaded = await uploadFeedMedia({ imageUris: [profile.avatarUri] });
    const url = uploaded.imageUris[0];
    if (url && isRemoteMediaUrl(url)) {
      patch.avatarUrl = url;
    }
  } else if (asHttp(profile.avatarUri)) {
    patch.avatarUrl = asHttp(profile.avatarUri);
  }
  if (profile.coverUri && !isRemoteMediaUrl(profile.coverUri)) {
    const uploaded = await uploadFeedMedia({ imageUris: [profile.coverUri] });
    const url = uploaded.imageUris[0];
    if (url && isRemoteMediaUrl(url)) {
      patch.coverUrl = url;
    }
  } else if (asHttp(profile.coverUri)) {
    patch.coverUrl = asHttp(profile.coverUri);
  }
  if (patch.avatarUrl || patch.coverUrl) {
    await apiUpsertProfile(patch);
    useLoyaltyStore.getState().updateProfile({
      ...(patch.avatarUrl ? { avatarUri: patch.avatarUrl } : {}),
      ...(patch.coverUrl ? { coverUri: patch.coverUrl } : {}),
    });
  }
}
