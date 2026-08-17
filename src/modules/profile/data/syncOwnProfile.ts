import { useAuthStore } from '@/modules/auth/state/auth-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { apiGetProfile, apiUpsertProfile } from '@/modules/social/data/socialApi';
import { uploadFeedMedia } from '@/modules/feed/data/uploadFeedMedia';
import { persistCreateMedia } from '@/modules/create/data/persistCreateMedia';
import { isRemoteMediaUrl } from '@/modules/chat/data/chatMedia';

function asHttp(uri?: string | null) {
  const u = uri?.trim() ?? '';
  return /^https?:\/\//i.test(u) ? u : '';
}

export async function saveProfilePhoto(kind: 'avatar' | 'cover', uri: string) {
  const stable = await persistCreateMedia(uri, 'image');
  const uploaded = await uploadFeedMedia({ imageUris: [stable] });
  const remote = uploaded.imageUris[0] || stable;
  if (kind === 'cover') {
    useLoyaltyStore.getState().updateProfile({ coverUri: remote });
    void apiUpsertProfile({ coverUrl: asHttp(remote) || undefined });
  } else {
    useLoyaltyStore.getState().updateProfile({ avatarUri: remote });
    void apiUpsertProfile({ avatarUrl: asHttp(remote) || undefined });
  }
  return remote;
}

export async function hydrateOwnProfileFromServer() {
  const user = useAuthStore.getState().user;
  if (!user?.id) return;
  const remote = await apiGetProfile(user.id);
  if (!remote) return;
  const local = useLoyaltyStore.getState().profile;
  useLoyaltyStore.getState().updateProfile({
    displayName: remote.displayName?.trim() || local.displayName,
    handle: remote.handle?.trim() || local.handle,
    bio: remote.bio ?? local.bio,
    avatarUri: asHttp(remote.avatarUrl) || local.avatarUri,
    coverUri: asHttp(remote.coverUrl) || local.coverUri,
  });
}

export async function syncLocalProfilePhotosIfNeeded() {
  const profile = useLoyaltyStore.getState().profile;
  const patch: { avatarUrl?: string; coverUrl?: string } = {};
  if (profile.avatarUri && !isRemoteMediaUrl(profile.avatarUri)) {
    const uploaded = await uploadFeedMedia({ imageUris: [profile.avatarUri] });
    const url = uploaded.imageUris[0];
    if (url && isRemoteMediaUrl(url)) {
      useLoyaltyStore.getState().updateProfile({ avatarUri: url });
      patch.avatarUrl = url;
    }
  } else if (asHttp(profile.avatarUri)) {
    patch.avatarUrl = asHttp(profile.avatarUri);
  }
  if (profile.coverUri && !isRemoteMediaUrl(profile.coverUri)) {
    const uploaded = await uploadFeedMedia({ imageUris: [profile.coverUri] });
    const url = uploaded.imageUris[0];
    if (url && isRemoteMediaUrl(url)) {
      useLoyaltyStore.getState().updateProfile({ coverUri: url });
      patch.coverUrl = url;
    }
  } else if (asHttp(profile.coverUri)) {
    patch.coverUrl = asHttp(profile.coverUri);
  }
  if (patch.avatarUrl || patch.coverUrl) {
    void apiUpsertProfile(patch);
  }
}
