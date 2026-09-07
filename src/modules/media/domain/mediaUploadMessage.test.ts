import { expect, it } from 'vitest';
import { mediaUploadMessage } from './mediaUploadMessage';

it.each([
  ['MEDIA_LOCAL_FILE_MISSING', 'เลือกรูป'],
  ['MEDIA_TOO_LARGE', 'ขนาดใหญ่'],
  ['MEDIA_OBJECT_UPLOAD_TIMEOUT', 'นานเกินไป'],
  ['MEDIA_OBJECT_UPLOAD_FAILED_403', 'ระบบจัดเก็บรูป'],
  ['MEDIA_STORAGE_NOT_CONFIGURED', 'ระบบจัดเก็บรูป'],
  ['Network request failed', 'อินเทอร์เน็ต'],
  ['SESSION_EXPIRED', 'เข้าสู่ระบบ'],
])('explains %s with a relevant next step', (code, text) => {
  expect(mediaUploadMessage(new Error(code))).toContain(text);
  expect(mediaUploadMessage(code)).toContain(text);
});
