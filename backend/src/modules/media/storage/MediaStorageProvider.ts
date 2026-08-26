export type MediaStorageKind = 'local' | 's3';

export type CreateMediaUploadInput = {
  ownerId: string;
  assetId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
};

export type MediaUploadTarget = {
  uploadUrl: string;
  publicUrl: string;
  fileKey: string;
  mediaType: 'image' | 'video';
  mimeType: string;
  headers: Record<string, string>;
  expiresIn: number;
  originalFilename: string;
};

export type StoredMediaObject = {
  contentLength?: number;
  contentType?: string;
};

export interface MediaStorageProvider {
  readonly kind: MediaStorageKind;
  createUploadTarget(input: CreateMediaUploadInput): Promise<MediaUploadTarget>;
  inspect(storageKey: string): Promise<StoredMediaObject>;
  remove(storageKey: string): Promise<void>;
  readiness(): Record<string, unknown>;
}
