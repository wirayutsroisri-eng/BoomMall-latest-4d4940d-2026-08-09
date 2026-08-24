import { UploadService, objectStorageReadiness } from '../../chat/services/upload.service';
import type { CreateMediaUploadInput, MediaStorageProvider } from './MediaStorageProvider';

export class S3MediaStorageProvider implements MediaStorageProvider {
  readonly kind = 's3' as const;

  createUploadTarget(input: CreateMediaUploadInput) {
    return UploadService.generateMediaAssetUploadUrl(
      input.ownerId,
      input.assetId,
      input.filename,
      input.mimeType,
      input.fileSize,
    );
  }

  inspect(storageKey: string) {
    return UploadService.assertObjectUploaded(storageKey);
  }

  readiness() {
    return { storage: this.kind, ...objectStorageReadiness() };
  }
}
