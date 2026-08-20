import React from 'react';
import { pickDevicePhotos } from '@/shared/media/photoLibraryStore';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useAvatarPhotoStore } from '../state/avatar-photo-store';
import { AvatarPhotoPreview } from './AvatarPhotoPreview';
import { CircularAvatarCrop } from './CircularAvatarCrop';
import { CoverBannerCrop } from './CoverBannerCrop';
import { saveProfilePhoto } from '../data/syncOwnProfile';

export async function pickProfileAvatar(): Promise<string | null> {
  const items = await pickDevicePhotos({
    selectionLimit: 1,
    title: 'เลือกรูปโปรไฟล์',
  });
  if (!items[0]?.uri) return null;
  return new Promise((resolve) => {
    useAvatarPhotoStore.getState().openCrop(items[0].uri, 'avatar', resolve);
  });
}

export async function pickProfileCover(): Promise<string | null> {
  const items = await pickDevicePhotos({
    selectionLimit: 1,
    title: 'เลือกรูปปก',
  });
  if (!items[0]?.uri) return null;
  return new Promise((resolve) => {
    useAvatarPhotoStore.getState().openCrop(items[0].uri, 'cover', resolve);
  });
}

export function AvatarPhotoHost() {
  const previewKind = useAvatarPhotoStore((s) => s.previewKind);
  const cropUri = useAvatarPhotoStore((s) => s.cropUri);
  const cropKind = useAvatarPhotoStore((s) => s.cropKind);
  const close = useAvatarPhotoStore((s) => s.close);
  const profile = useLoyaltyStore((s) => s.profile);

  const changePhoto = async () => {
    const kind = useAvatarPhotoStore.getState().previewKind;
    close();
    if (kind === 'cover') {
      const uri = await pickProfileCover();
      if (uri) await saveProfilePhoto('cover', uri);
      return;
    }
    const uri = await pickProfileAvatar();
    if (uri) await saveProfilePhoto('avatar', uri);
  };

  if (cropUri) {
    const finishCrop = (uri: string) => {
      useAvatarPhotoStore.getState().resolveCropPromise(uri);
      close();
    };
    if (cropKind === 'cover') {
      return (
        <CoverBannerCrop uri={cropUri} onCancel={close} onSave={finishCrop} />
      );
    }
    return (
      <CircularAvatarCrop uri={cropUri} onCancel={close} onSave={finishCrop} />
    );
  }
  if (previewKind) {
    return (
      <AvatarPhotoPreview
        kind={previewKind}
        uri={previewKind === 'cover' ? profile.coverUri : profile.avatarUri}
        initial={profile.displayName.slice(0, 1)}
        onChangePhoto={() => void changePhoto()}
        onClose={close}
      />
    );
  }
  return null;
}
