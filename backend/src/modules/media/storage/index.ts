import { AppError } from '../../../lib/errors';
import { LocalMediaStorageProvider } from './LocalMediaStorageProvider';
import type { MediaStorageProvider } from './MediaStorageProvider';
import { S3MediaStorageProvider } from './S3MediaStorageProvider';

let cached: MediaStorageProvider | undefined;

export function configuredMediaStorageKind() {
  const value = (process.env.MEDIA_STORAGE || 's3').trim().toLowerCase();
  if (value !== 'local' && value !== 's3') {
    throw new AppError('MEDIA_STORAGE_INVALID', 'MEDIA_STORAGE must be local or s3', 500);
  }
  return value;
}

export function mediaStorageProvider(): MediaStorageProvider {
  if (cached) return cached;
  cached = configuredMediaStorageKind() === 'local'
    ? new LocalMediaStorageProvider()
    : new S3MediaStorageProvider();
  return cached;
}

export function resetMediaStorageProviderForTests() {
  cached = undefined;
}
