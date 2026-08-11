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

const seedIncomingOrders: IncomingOrder[] = [
  {
    id: 'io-1',
    masterSkuId: 'ms-05',
    customerName: 'ลูกค้า VIP — คุณมิ้นท์',
    customerAvatarColor: '#F5A524',
    productTitle: '60V 32Ah Smart BMS Pack',
    qty: 1,
    amount: 18900,
    currency: 'THB',
    status: 'paid',
    placedAt: '12 นาทีที่แล้ว',
  },
  {
    id: 'io-2',
    masterSkuId: 'ms-06',
    customerName: 'น้อง Sky',
    customerAvatarColor: '#FE2C55',
    productTitle: 'CNC Front Brake Master',
    qty: 1,
    amount: 1190,
    currency: 'THB',
    status: 'pending',
    placedAt: '38 นาทีที่แล้ว',
  },
  {
    id: 'io-3',
    masterSkuId: 'ms-09',
    customerName: 'เอกช่างกลึง',
    customerAvatarColor: '#E5893A',
    productTitle: 'Multi-Voltage Fast Charger',
    qty: 2,
    amount: 3180,
    currency: 'THB',
    status: 'shipped',
    placedAt: 'เมื่อวาน',
  },
  {
    id: 'io-4',
    masterSkuId: 'ms-10',
    customerName: 'กบสกู๊ตเตอร์',
    customerAvatarColor: '#2FA36B',
    productTitle: 'CNC Star Rim 14"',
    qty: 1,
    amount: 4500,
    currency: 'THB',
    status: 'delivered',
    placedAt: '3 วันที่แล้ว',
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
  cancelMyOrder: (id: string) => void;
  markInquiryRead: (id: string) => void;
  markProductAlertsSeen: (masterSkuId: string) => void;
};

export const useOrdersStore = create<OrdersState>((set) => ({
  myOrders: seedMyOrders,
  incomingOrders: seedIncomingOrders,
  inquiries: seedInquiries,
  advanceIncomingOrder: (id) =>
    set((state) => ({
      incomingOrders: state.incomingOrders.map((o) =>
        o.id === id ? { ...o, status: nextStatus(o.status) } : o,
      ),
    })),
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
}));
