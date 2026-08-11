import { File, Paths } from 'expo-file-system';
import { ImageFormat, type SkImage } from '@shopify/react-native-skia';

/** บันทึก Skia snapshot เป็นไฟล์ JPEG ใน cache */
export function saveSkiaImageToCache(image: SkImage, prefix = 'edit'): string {
  const bytes = image.encodeToBytes(ImageFormat.JPEG, 92);
  const file = new File(Paths.cache, `${prefix}-${Date.now()}.jpg`);
  if (!file.exists) {
    file.create();
  }
  file.write(bytes);
  return file.uri;
}
