import React from 'react';
import { pickDevicePhotos } from '@/shared/media/photoLibraryStore';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useAvatarPhotoStore } from '../state/avatar-photo-store';
import { AvatarPhotoPreview } from './AvatarPhotoPreview';
import { CircularAvatarCrop } from './CircularAvatarCrop';
import { saveProfilePhoto } from '../data/syncOwnProfile';

export async function pickProfileAvatar() {
  const items = await pickDevicePhotos({
    selectionLimit: 1,
    title: 'เลือกรูปโปรไฟล์',
  });
  if (!items[0]?.uri) return;
  useAvatarPhotoStore.getState().openCrop(items[0].uri);
}

export function AvatarPhotoHost() {
  const previewKind = useAvatarPhotoStore((s) => s.previewKind);
  const cropUri = useAvatarPhotoStore((s) => s.cropUri);
  const close = useAvatarPhotoStore((s) => s.close);
  const profile = useLoyaltyStore((s) => s.profile);

  const changePhoto = async () => {
    const kind = useAvatarPhotoStore.getState().previewKind;
    close();
    if (kind === 'cover') {
      const items = await pickDevicePhotos({
        selectionLimit: 1,
        title: 'เลือกรูปปก',
        editAfterPick: true,
        initialEditTool: 'crop',
      });
      if (!items[0]?.uri) return;
      await saveProfilePhoto('cover', items[0].uri);
      return;
    }
    await pickProfileAvatar();
  };

  const saveCrop = async (uri: string) => {
    await saveProfilePhoto('avatar', uri);
    close();
  };

  if (cropUri) {
    return <CircularAvatarCrop uri={cropUri} onCancel={close} onSave={(uri) => void saveCrop(uri)} />;
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
