import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalMediaStorageProvider } from './LocalMediaStorageProvider';

const originalEnvironment = {
  LOCAL_MEDIA_DIR: process.env.LOCAL_MEDIA_DIR,
  MEDIA_PUBLIC_BASE_URL: process.env.MEDIA_PUBLIC_BASE_URL,
  LOCAL_MEDIA_UPLOAD_SECRET: process.env.LOCAL_MEDIA_UPLOAD_SECRET,
};

let directory = '';

beforeEach(async () => {
  directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'boommall-local-media-'));
  process.env.LOCAL_MEDIA_DIR = directory;
  process.env.MEDIA_PUBLIC_BASE_URL = 'http://192.168.1.89:4000';
  process.env.LOCAL_MEDIA_UPLOAD_SECRET = 'test-only-secret-with-enough-entropy';
});

afterEach(async () => {
  await fs.promises.rm(directory, { recursive: true, force: true });
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
});

function requestFor(bytes: Buffer, mimeType: string): Request {
  const stream = Readable.from([bytes]) as unknown as Request;
  stream.headers = { 'content-type': mimeType, 'content-length': String(bytes.length) };
  return stream;
}

describe('LocalMediaStorageProvider', () => {
  it('creates a LAN HTTP upload target with a backend-owned UUID filename', async () => {
    const provider = new LocalMediaStorageProvider();
    const target = await provider.createUploadTarget({
      ownerId: '../user',
      assetId: '3f06f39d-e607-45b7-81ab-dc40b343ea69',
      filename: '../../dangerous name.jpg',
      mimeType: 'image/jpeg',
      fileSize: 4,
    });
    expect(target.fileKey).toBe('images/3f06f39d-e607-45b7-81ab-dc40b343ea69.jpg');
    expect(target.publicUrl).toBe('http://192.168.1.89:4000/uploads/images/3f06f39d-e607-45b7-81ab-dc40b343ea69.jpg');
    expect(target.uploadUrl).toMatch(/^http:\/\/192\.168\.1\.89:4000\/api\/v1\/media-assets\/local-upload\//);
    expect(target.uploadUrl).not.toContain('dangerous');
  });

  it('persists valid image bytes and can inspect them after creating a new provider', async () => {
    const provider = new LocalMediaStorageProvider();
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const assetId = '3f06f39d-e607-45b7-81ab-dc40b343ea69';
    const target = await provider.createUploadTarget({
      ownerId: 'user-1', assetId, filename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: bytes.length,
    });
    const token = new URL(target.uploadUrl).searchParams.get('token')!;
    await provider.receiveUpload({
      request: requestFor(bytes, 'image/jpeg'),
      assetId,
      storageKey: target.fileKey,
      mimeType: 'image/jpeg',
      fileSize: bytes.length,
      token,
      maxBytes: 1024,
    });
    const restartedProvider = new LocalMediaStorageProvider();
    await expect(restartedProvider.inspect(target.fileKey)).resolves.toEqual({
      contentLength: bytes.length,
      contentType: 'image/jpeg',
    });
  });

  it('rejects executable bytes disguised as an allowed image', async () => {
    const provider = new LocalMediaStorageProvider();
    const bytes = Buffer.from('#!/bin/sh\necho unsafe\n');
    const assetId = '3f06f39d-e607-45b7-81ab-dc40b343ea69';
    const target = await provider.createUploadTarget({
      ownerId: 'user-1', assetId, filename: 'fake.jpg', mimeType: 'image/jpeg', fileSize: bytes.length,
    });
    await expect(provider.receiveUpload({
      request: requestFor(bytes, 'image/jpeg'),
      assetId,
      storageKey: target.fileKey,
      mimeType: 'image/jpeg',
      fileSize: bytes.length,
      token: new URL(target.uploadUrl).searchParams.get('token')!,
      maxBytes: 1024,
    })).rejects.toThrow(/do not match/i);
    await expect(fs.promises.stat(path.join(directory, target.fileKey))).rejects.toThrow();
  });

  it('rejects traversal storage keys', async () => {
    const provider = new LocalMediaStorageProvider();
    await expect(provider.inspect('../outside.jpg')).rejects.toThrow(/storage key/i);
  });
});
