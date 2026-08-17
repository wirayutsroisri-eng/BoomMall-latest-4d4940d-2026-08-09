import { create } from 'zustand';
import type {
  IncomingOrder,
  MyOrder,
  OrderStatus,
  ProductInquiry,
} from '../domain/types';

const STATUS_FLOW: OrderStatus[] = ['pending', 'paid', 'shipped', 'delivered'];

function nextStatus(status: OrderStatus): OrderStatus {
  const idx = STATUS_FLOW.indexOf(status);
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return status;
  return STATUS_FLOW[idx + 1];
}

const seedMyOrders: MyOrder[] = [
  {
    id: 'mo-1',
    productTitle: 'LiFePO4 60V 32Ah Smart BMS Pack',
    variantLabel: 'สีดำ · 60V/32Ah',
    thumbnailColor: '#0B3D2E',
    imageUri: 'https://picsum.photos/seed/order-battery/200/200',
    qty: 1,
    amount: 18900,
    currency: 'THB',
    status: 'shipped',
    placedAt: '2 วันที่แล้ว',
    shopName: 'Boom EV Shop Chanthaburi',
    trackingNo: 'BEV-TH-88213001',
    shippingHeadline: 'กำลังรอขนส่งเข้ารับ',
    shippingDetail: 'พัสดุของคุณแพ็กเรียบร้อยแล้ว และกำลังรอผู้ให้บริการขนส่งเข้ารับ',
    isMall: true,
  },
  {
    id: 'mo-2',
    productTitle: 'CNC Front Brake Master',
    variantLabel: 'อะลูมิเนียม · สีเงิน',
    thumbnailColor: '#243447',
    imageUri: 'https://picsum.photos/seed/order-cnc/200/200',
    qty: 2,
    amount: 2380,
    currency: 'THB',
    status: 'paid',
    placedAt: '5 วันที่แล้ว',
    shopName: 'Boom EV Shop Chanthaburi',
    shippingHeadline: 'ร้านกำลังเตรียมจัดส่ง',
    shippingDetail: 'วันที่จัดส่งถึงโดยประมาณ: 15 ส.ค. - 18 ส.ค.',
    isMall: true,
  },
  {
    id: 'mo-3',
    productTitle: 'ค่าแรงตรวจเช็คระบบไฟฟ้า EV',
    variantLabel: 'บริการที่ร้าน · จันทบุรี',
    thumbnailColor: '#5B3A29',
    imageUri: 'https://picsum.photos/seed/order-service/200/200',
    qty: 1,
    amount: 450,
    currency: 'THB',
    status: 'delivered',
    placedAt: '2 สัปดาห์ที่แล้ว',
    shopName: 'ทีมช่าง Boom EV จันทบุรี',
    shippingHeadline: 'จัดส่งคำสั่งซื้อสำเร็จแล้ว',
    shippingDetail: '15:29 จัดส่งสำเร็จ',
    needsReview: true,
  },
  {
    id: 'mo-4',
    productTitle: 'ยางนอกมอเตอร์ไซค์ไฟฟ้า 90/90-14',
    variantLabel: 'ลายเดิม · 1 คู่',
    thumbnailColor: '#3A2E51',
    imageUri: 'https://picsum.photos/seed/order-tire/200/200',
    qty: 1,
    amount: 1290,
    currency: 'THB',
    status: 'pending',
    placedAt: 'วันนี้',
    shopName: 'แม่ค้าโชว์รูมจันทบุรี',
    shippingHeadline: 'รอชำระเงิน',
    shippingDetail: 'ชำระภายใน 24 ชม. มิฉะนั้นออเดอร์จะถูกยกเลิกอัตโนมัติ',
  },
  {
    id: 'mo-5',
    productTitle: 'สายชาร์จเร็ว Type 2 22kW',
    variantLabel: 'ยาว 5 เมตร',
    thumbnailColor: '#0F4C4C',
    imageUri: 'https://picsum.photos/seed/order-cable/200/200',
    qty: 1,
    amount: 3590,
    currency: 'THB',
    status: 'cancelled',
    placedAt: '1 เดือนที่แล้ว',
    shopName: 'Boom EV Shop Chanthaburi',
    shippingHeadline: 'คำขอคืนสินค้าเสร็จสิ้น',
    shippingDetail: 'เงินคืนเข้าบัญชีแล้ว',
    isMall: true,
  },
  {
    id: 'mo-6',
    productTitle: 'Hub Motor 3000W ล้อ 14"',
    variantLabel: 'ดำ · 3000W',
    thumbnailColor: '#1A1A2E',
    imageUri: 'https://picsum.photos/seed/order-hub/200/200',
    qty: 1,
    amount: 7900,
    currency: 'THB',
    status: 'delivered',
    placedAt: '3 สัปดาห์ที่แล้ว',
    shopName: 'โรงงาน EV Parts จันทบุรี',
    shippingHeadline: 'จัดส่งคำสั่งซื้อสำเร็จแล้ว',
    shippingDetail: '10:12 จัดส่งสำเร็จ',
    needsReview: true,
  },
  {
    id: 'mo-7',
    productTitle: 'FOC Controller 48-72V',
    variantLabel: '72V',
    thumbnailColor: '#0F2A3A',
    imageUri: 'https://picsum.photos/seed/order-foc/200/200',
    qty: 1,
    amount: 4900,
    currency: 'THB',
    status: 'delivered',
    placedAt: '1 เดือนที่แล้ว',
    shopName: 'Boom EV Shop Chanthaburi',
    shippingHeadline: 'จัดส่งคำสั่งซื้อสำเร็จแล้ว',
    shippingDetail: '18:40 จัดส่งสำเร็จ',
    needsReview: true,
    isMall: true,
  },
];

const SEED_NOW = Date.now();

const seedIncomingOrders: IncomingOrder[] = [
  {
    id: 'io-kit',
    masterSkuId: 'ms-ext-02',
    buyerId: 'buyer-kit-chanthaburi',
    customerName: 'ช่างเอก คอนเวอร์ชัน',
    customerAvatarColor: '#2E8CFF',
    productTitle: 'Hub Motor ล้อ 14"',
    qty: 5,
    amount: 20390,
    currency: 'THB',
    status: 'paid',
    placedAt: '12 นาทีที่แล้ว',
    placedAtIso: new Date(SEED_NOW - 12 * 60_000).toISOString(),
    shippingSpeed: 'standard',
    imageUri: 'https://picsum.photos/seed/boom-motor-hub/720/720',
    recipientPhone: '0815550199',
    shippingAddress: '88/12 ถ.ตรีรัตน์ ต.วัดใหม่ อ.เมืองจันทบุรี จ.จันทบุรี 22000',
    paymentMethod: 'PAID',
    sku: 'BEV-MTR-3000',
    variantLabel: '3000W',
    lines: [
      {
        productId: 'ms-motor',
        title: 'Hub Motor ล้อ 14"',
        option: '3000W',
        qty: 1,
        sku: 'BEV-MTR-3000',
        unitPrice: 6900,
        imageUri: 'https://picsum.photos/seed/boom-motor-hub/720/720',
      },
      {
        productId: 'ms-motor',
        title: 'Hub Motor ล้อ 14"',
        option: '2000W',
        qty: 1,
        sku: 'BEV-MTR-2000',
        unitPrice: 5900,
        imageUri: 'https://picsum.photos/seed/boom-motor-hub/720/720',
      },
      {
        productId: 'ms-ctrl',
        title: 'ตัวควบคุม FOC',
        option: '680',
        qty: 1,
        sku: 'BEV-CTL-680',
        unitPrice: 3200,
        imageUri: 'https://picsum.photos/seed/boom-ctrl/720/720',
      },
      {
        productId: 'ms-ctrl',
        title: 'ตัวควบคุม FOC',
        option: '1200',
        qty: 1,
        sku: 'BEV-CTL-1200',
        unitPrice: 3800,
        imageUri: 'https://picsum.photos/seed/boom-ctrl/720/720',
      },
      {
        productId: 'ms-thr',
        title: 'คันเร่ง Hall Sensor',
        option: 'มาตรฐาน',
        qty: 1,
        sku: 'EVP-THR-STD',
        unitPrice: 590,
        imageUri: 'https://picsum.photos/seed/boom-throttle/720/720',
      },
    ],
  },
  {
    id: 'io-1',
    masterSkuId: 'ms-05',
    buyerId: 'buyer-weerayut',
    customerName: 'นายวีรยุทธ สร้อยศรี',
    customerAvatarColor: '#F5A524',
    productTitle: '60V 32Ah Smart BMS Pack',
    qty: 1,
    amount: 18900,
    currency: 'THB',
    status: 'paid',
    placedAt: '3 ชม. ที่แล้ว',
    placedAtIso: new Date(SEED_NOW - 3.2 * 3600_000).toISOString(),
    shippingSpeed: 'express',
    imageUri: 'https://picsum.photos/seed/boom-shop-ms-05/720/720',
    recipientPhone: '(+66) 99 926 6218',
    shippingAddress: '29/247 ม.7 ต.จันทนิมิต อ.เมืองจันทบุรี จ.จันทบุรี 22000',
    paymentMethod: 'COD',
    sku: 'BAT-60-32',
    variantLabel: 'สีดำ · 60V/32Ah',
    lines: [
      {
        title: '60V 32Ah Smart BMS Pack',
        option: 'สีดำ · 60V/32Ah',
        qty: 1,
        sku: 'BAT-60-32',
        unitPrice: 18900,
        imageUri: 'https://picsum.photos/seed/boom-shop-ms-05/720/720',
      },
    ],
  },
  {
    id: 'io-1b',
    masterSkuId: 'ms-06',
    buyerId: 'buyer-weerayut',
    customerName: 'วีรยุทธ สร้อยศรี',
    customerAvatarColor: '#F5A524',
    productTitle: 'CNC Front Brake Master',
    qty: 2,
    amount: 2380,
    currency: 'THB',
    status: 'paid',
    placedAt: '18 นาทีที่แล้ว',
    placedAtIso: new Date(SEED_NOW - 18 * 60_000).toISOString(),
    shippingSpeed: 'standard',
    imageUri: 'https://picsum.photos/seed/boom-shop-ms-06/720/720',
    recipientPhone: '0999266218',
    shippingAddress: '29/247 ม.7 จันทนิมิต เมืองจันทบุรี จันทบุรี 22000',
    paymentMethod: 'COD',
    sku: 'BRK-CNC-01',
    variantLabel: 'อะลูมิเนียม · สีเงิน',
    lines: [
      {
        title: 'CNC Front Brake Master',
        option: 'อะลูมิเนียม · สีเงิน',
        qty: 2,
        sku: 'BRK-CNC-01',
        unitPrice: 1190,
        imageUri: 'https://picsum.photos/seed/boom-shop-ms-06/720/720',
      },
    ],
  },
  {
    id: 'io-wait',
    masterSkuId: 'ms-09',
    buyerId: 'buyer-fleet-chanthaburi',
    customerName: 'ทีมฟลีทจันทบุรี',
    customerAvatarColor: '#2E8CFF',
    productTitle: 'Multi-Voltage Fast Charger',
    qty: 5,
    amount: 5550,
    currency: 'THB',
    status: 'paid',
    placedAt: '6 ชม. ที่แล้ว',
    placedAtIso: new Date(SEED_NOW - 6 * 3600_000).toISOString(),
    shippingSpeed: 'standard',
    imageUri: 'https://picsum.photos/seed/boom-shop-ms-09b/720/720',
    recipientPhone: '0830001122',
    shippingAddress: '55 นิคมอุตสาหกรรม อ.แหลมสิงห์ จ.จันทบุรี 22130',
    paymentMethod: 'PAID',
    sku: 'CHG-MV-02',
    variantLabel: '48-72V',
    lines: [
      {
        title: 'Multi-Voltage Fast Charger',
        option: '48-72V',
        qty: 3,
        sku: 'CHG-MV-02',
        unitPrice: 1590,
        imageUri: 'https://picsum.photos/seed/boom-shop-ms-09b/720/720',
      },
      {
        title: 'สายไฟ 10AWG Pair',
        option: '1.5 ม. · แดง/ดำ',
        qty: 2,
        sku: 'CBL-10-15',
        unitPrice: 390,
        imageUri: 'https://picsum.photos/seed/boom-shop-cable/720/720',
      },
    ],
  },
  {
    id: 'io-2',
    masterSkuId: 'ms-06',
    buyerId: 'buyer-sky',
    customerName: 'น้อง Sky',
    customerAvatarColor: '#FE2C55',
    productTitle: 'CNC Front Brake Master',
    qty: 1,
    amount: 1190,
    currency: 'THB',
    status: 'pending',
    placedAt: '38 นาทีที่แล้ว',
    placedAtIso: new Date(SEED_NOW - 38 * 60_000).toISOString(),
    shippingSpeed: 'standard',
    imageUri: 'https://picsum.photos/seed/boom-shop-ms-06b/720/720',
    recipientPhone: '0812345678',
    shippingAddress: '88 ถ.ตรีรัตน์ ต.วัดใหม่ อ.เมืองจันทบุรี จ.จันทบุรี 22000',
    paymentMethod: 'COD',
    sku: 'BRK-CNC-01',
    variantLabel: 'สีเงิน',
  },
  {
    id: 'io-3',
    masterSkuId: 'ms-09',
    buyerId: 'buyer-ek',
    customerName: 'เอกช่างกลึง',
    customerAvatarColor: '#E5893A',
    productTitle: 'Multi-Voltage Fast Charger',
    qty: 2,
    amount: 3180,
    currency: 'THB',
    status: 'shipped',
    placedAt: 'เมื่อวาน',
    placedAtIso: new Date(SEED_NOW - 26 * 3600_000).toISOString(),
    shippingSpeed: 'standard',
    imageUri: 'https://picsum.photos/seed/boom-shop-ms-09/720/720',
    trackingNo: 'BEV-TH-44190218',
    recipientPhone: '0891112233',
    shippingAddress: '12/4 ม.3 ต.คมบาง อ.เมืองจันทบุรี จ.จันทบุรี 22000',
    paymentMethod: 'PAID',
    sku: 'CHG-MV-02',
    variantLabel: '48-72V',
    lines: [
      {
        title: 'Multi-Voltage Fast Charger',
        option: '48-72V',
        qty: 2,
        sku: 'CHG-MV-02',
        unitPrice: 1590,
        imageUri: 'https://picsum.photos/seed/boom-shop-ms-09/720/720',
      },
    ],
  },
  {
    id: 'io-4',
    masterSkuId: 'ms-10',
    buyerId: 'buyer-kob',
    customerName: 'กบสกู๊ตเตอร์',
    customerAvatarColor: '#2FA36B',
    productTitle: 'CNC Star Rim 14"',
    qty: 1,
    amount: 4500,
    currency: 'THB',
    status: 'delivered',
    placedAt: '3 วันที่แล้ว',
    placedAtIso: new Date(SEED_NOW - 3 * 86400_000).toISOString(),
    shippingSpeed: 'standard',
    imageUri: 'https://picsum.photos/seed/boom-shop-ms-10/720/720',
    returnRequested: true,
    recipientPhone: '0625550199',
    shippingAddress: '9 ซ.ตลาดน้ำ ต.ตลาด อ.เมืองจันทบุรี จ.จันทบุรี 22000',
    paymentMethod: 'PAID',
    sku: 'RIM-14-ST',
    variantLabel: 'ลายดาว · ดำ',
  },
];

const seedInquiries: ProductInquiry[] = [
  {
    id: 'inq-1',
    masterSkuId: 'ms-05',
    customerName: 'ช่างเอิร์ธ Boom EV',
    customerAvatarColor: '#00A86B',
    message: 'แพ็ก 60V ติดรถสกู๊ตได้ไหมครับ มีรับประกันกี่ปี?',
    placedAt: '5 นาทีที่แล้ว',
    unread: true,
  },
  {
    id: 'inq-2',
    masterSkuId: 'ms-01',
    customerName: 'แม่ค้าโชว์รูมจันทบุรี',
    customerAvatarColor: '#2E8CFF',
    message: 'สั่ง Starter Pack 3 ลูก มีส่วนลดไหมคะ',
    placedAt: '20 นาทีที่แล้ว',
    unread: true,
  },
  {
    id: 'inq-3',
    masterSkuId: 'ms-06',
    customerName: 'น้อง Sky',
    customerAvatarColor: '#FE2C55',
    message: 'ปั๊มเบรกสีเงินยังมีสต็อกไหมคะ',
    placedAt: '1 ชั่วโมงที่แล้ว',
    unread: true,
  },
  {
    id: 'inq-4',
    masterSkuId: 'ms-08',
    customerName: 'ทีมฟลีทจันทบุรี',
    customerAvatarColor: '#C9A227',
    message: 'คอนโทรลเลอร์ 48-72V สั่ง B2B ได้กี่ตัว?',
    placedAt: 'เมื่อวาน',
    unread: true,
  },
];

type OrdersState = {
  myOrders: MyOrder[];
  incomingOrders: IncomingOrder[];
  inquiries: ProductInquiry[];
  advanceIncomingOrder: (id: string) => void;
  acceptIncomingReturn: (id: string) => { ok: true } | { ok: false; reason: string };
  cancelIncomingOrder: (id: string) => { ok: true } | { ok: false; reason: string };
  cancelMyOrder: (id: string) => void;
  markInquiryRead: (id: string) => void;
  markProductAlertsSeen: (masterSkuId: string) => void;
  upsertIncoming: (orders: IncomingOrder[]) => void;
};

export const useOrdersStore = create<OrdersState>((set, get) => ({
  myOrders: seedMyOrders,
  incomingOrders: seedIncomingOrders,
  inquiries: seedInquiries,
  advanceIncomingOrder: (id) =>
    set((state) => ({
      incomingOrders: state.incomingOrders.map((o) => {
        if (o.id !== id) return o;
        const status = nextStatus(o.status);
        const trackingNo =
          o.status === 'paid' && status === 'shipped'
            ? o.trackingNo ?? `BEV-TH-${`${Date.now()}`.slice(-8)}`
            : o.trackingNo;
        return { ...o, status, trackingNo };
      }),
    })),
  acceptIncomingReturn: (id) => {
    const order = get().incomingOrders.find((o) => o.id === id);
    if (!order) return { ok: false, reason: 'ไม่พบออเดอร์' };
    if (!order.returnRequested || order.status !== 'delivered') {
      return { ok: false, reason: 'รายการนี้ไม่ได้ขอคืนสินค้า' };
    }
    set((state) => ({
      incomingOrders: state.incomingOrders.map((o) =>
        o.id === id ? { ...o, status: 'cancelled', returnRequested: false } : o,
      ),
    }));
    return { ok: true };
  },
  cancelIncomingOrder: (id) => {
    const order = get().incomingOrders.find((o) => o.id === id);
    if (!order) return { ok: false, reason: 'ไม่พบออเดอร์' };
    if (order.status !== 'pending') {
      return { ok: false, reason: 'ยกเลิกได้เฉพาะออเดอร์ที่ยังไม่ชำระ' };
    }
    set((state) => ({
      incomingOrders: state.incomingOrders.map((o) =>
        o.id === id ? { ...o, status: 'cancelled' } : o,
      ),
    }));
    return { ok: true };
  },
  cancelMyOrder: (id) =>
    set((state) => ({
      myOrders: state.myOrders.map((o) => (o.id === id ? { ...o, status: 'cancelled' } : o)),
    })),
  markInquiryRead: (id) =>
    set((state) => ({
      inquiries: state.inquiries.map((q) => (q.id === id ? { ...q, unread: false } : q)),
    })),
  markProductAlertsSeen: (masterSkuId) =>
    set((state) => ({
      inquiries: state.inquiries.map((q) =>
        q.masterSkuId === masterSkuId ? { ...q, unread: false } : q,
      ),
    })),
  upsertIncoming: (orders) =>
    set((state) => {
      if (!orders.length) return state;
      const next = [...state.incomingOrders];
      for (const order of orders) {
        const at = next.findIndex((row) => row.id === order.id);
        if (at >= 0) next[at] = { ...next[at], ...order, lines: order.lines ?? next[at]?.lines };
        else next.unshift(order);
      }
      return { incomingOrders: next };
    }),
}));
