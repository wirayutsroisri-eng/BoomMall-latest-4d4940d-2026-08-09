export type CourierEvent = 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED';

export function courierHeadline(event?: string | null, tracking?: string | null) {
  const key = (event ?? '').trim().toUpperCase();
  const track = tracking?.trim();
  if (key === 'OUT_FOR_DELIVERY') return track ? `กำลังนำส่ง · ${track}` : 'กำลังนำส่ง';
  if (key === 'PICKED_UP') return track ? `ขนส่งรับแล้ว · ${track}` : 'ขนส่งรับพัสดุแล้ว';
  if (key === 'DELIVERED') return track ? `ส่งถึงแล้ว · ${track}` : 'ส่งถึงแล้ว';
  if (key === 'RETURNED') return track ? `ตีกลับ · ${track}` : 'พัสดุตีกลับ';
  return track || 'มีเลขพัสดุแล้ว';
}

export function isPackedShippingStatus(status?: string | null) {
  const key = (status ?? '').trim().toUpperCase();
  return key === 'PACKED' || key === 'SHIPPED' || key === 'DELIVERED';
}
