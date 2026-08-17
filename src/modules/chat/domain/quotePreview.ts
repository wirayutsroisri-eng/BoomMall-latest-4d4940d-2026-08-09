import type { ChatMessage, MessageQuote } from '@/modules/chat/domain/types';

export function quotePreviewLabel(source: ChatMessage | MessageQuote): string {
  switch (source.kind) {
    case 'image': {
      const n =
        'imageUris' in source && Array.isArray(source.imageUris) && source.imageUris.length > 1
          ? source.imageUris.length
          : 1;
      return n > 1 ? `รูปภาพ ${n} รูป` : 'รูปภาพ';
    }
    case 'file':
      return source.fileName?.trim() || 'ไฟล์';
    case 'voice':
      return 'ข้อความเสียง';
    case 'quotation':
      if ('quotation' in source) return source.quotation?.title ?? 'ใบเสนอราคา';
      return source.text?.trim() || 'ใบเสนอราคา';
    case 'product':
      if ('product' in source) return source.product?.title ?? 'สินค้า';
      return source.text?.trim() || 'สินค้า';
    case 'order_ref':
      if ('orderRef' in source) return source.orderRef ? `ออเดอร์ ${source.orderRef.orderId}` : 'ออเดอร์';
      return source.text?.trim() || 'ออเดอร์';
    case 'content_ref':
      if ('contentRef' in source) return source.contentRef?.title ?? 'คอนเทนต์';
      return source.text?.trim() || 'คอนเทนต์';
    case 'job_match':
      if ('jobMatch' in source) return source.jobMatch?.header ?? 'งาน';
      return source.text?.trim() || 'งาน';
    default:
      return source.text?.trim() || 'ข้อความ';
  }
}

export function quotePreviewImage(source: ChatMessage | MessageQuote): string | undefined {
  if ('product' in source && source.product?.imageUri) return source.product.imageUri;
  if ('orderRef' in source && source.orderRef?.imageUri) return source.orderRef.imageUri;
  if ('contentRef' in source && source.contentRef?.imageUri) return source.contentRef.imageUri;
  if ('imageUris' in source && source.imageUris?.[0]) return source.imageUris[0];
  return source.imageUri;
}

export function toMessageQuote(
  message: ChatMessage,
  sender?: { name?: string; avatarUri?: string; avatarColor?: string },
): MessageQuote {
  return {
    messageId: message.id,
    kind: message.kind,
    text: quotePreviewLabel(message),
    imageUri: quotePreviewImage(message),
    fileName: message.fileName,
    senderName: sender?.name,
    senderAvatarUri: sender?.avatarUri,
    senderAvatarColor: sender?.avatarColor,
  };
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
