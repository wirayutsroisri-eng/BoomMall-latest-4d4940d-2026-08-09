/** Actionable upload failures for both the publish screen and failed feed cards. */
export function mediaUploadMessage(error: unknown): string {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  const status = (error as { statusCode?: number } | null)?.statusCode;
  if (status === 401 || /UNAUTHORIZED|TOKEN_EXPIRED|SESSION_EXPIRED/.test(message)) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วลองโพสต์อีกครั้ง';
  if (/MEDIA_LOCAL_FILE_MISSING|MEDIA_FILE_SIZE_REQUIRED|permission|not readable|does not exist/i.test(message)) return 'อ่านรูปในเครื่องไม่ได้ กรุณาเลือกรูปจากแกลเลอรีอีกครั้งและอนุญาตให้แอปเข้าถึงรูป';
  if (status === 413 || /MEDIA_TOO_LARGE/.test(message)) return 'ไฟล์มีขนาดใหญ่เกินที่เซิร์ฟเวอร์รับได้ กรุณาเลือกรูปที่มีขนาดเล็กลง';
  if (/UNSUPPORTED_MEDIA_TYPE|MEDIA_TYPE_MISMATCH/.test(message)) return 'เซิร์ฟเวอร์ไม่รองรับรูปแบบไฟล์นี้ กรุณาลองรูป JPEG หรือ PNG';
  if (/TIMEOUT|timed out/i.test(message)) return 'การอัปโหลดใช้เวลานานเกินไป กรุณาลองอีกครั้งเมื่อสัญญาณอินเทอร์เน็ตเสถียร';
  if (/STORAGE|MEDIA_API_UNAVAILABLE|MEDIA_OBJECT_UPLOAD_FAILED|MEDIA_ASSET_NOT_READY|MEDIA_REMOTE_URL_INVALID|MEDIA_UPLOAD_NOT_VERIFIED/.test(message)) return 'ระบบจัดเก็บรูปยังรับหรือยืนยันไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
  if (/network|connection|fetch failed|failed to fetch/i.test(message)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  return 'ส่งโพสต์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หากยังไม่สำเร็จให้ลองเลือกรูปใหม่';
}
