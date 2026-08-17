import { Share, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

export async function writeShareFile(bytes: Uint8Array, filename: string): Promise<string> {
  const file = new File(Paths.cache, filename);
  if (file.exists) {
    try {
      file.delete();
    } catch {
      /* ignore */
    }
  }
  file.create();
  file.write(bytes);
  return file.uri;
}

/** Opens the system share sheet so the seller picks LINE / Files / Messages / etc. */
export async function shareFulfillmentLabel(input: {
  uri?: string;
  message: string;
  title?: string;
}): Promise<'shared' | 'cancelled'> {
  const title = input.title ?? 'แชร์ใบปะหน้า';
  const result = await Share.share(
    input.uri
      ? Platform.OS === 'ios'
        ? { url: input.uri, message: input.message, title }
        : { url: input.uri, message: input.message, title }
      : { message: input.message, title },
  );
  if (result.action === Share.dismissedAction) return 'cancelled';
  return 'shared';
}
