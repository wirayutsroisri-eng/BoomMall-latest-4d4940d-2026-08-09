import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { UploadService, objectStorageReadiness, storageClient } from '../../chat/services/upload.service';
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

  async remove(storageKey: string) {
    const { client, config } = storageClient();
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: storageKey }));
  }

  readiness() {
    return { storage: this.kind, ...objectStorageReadiness() };
  }
}
