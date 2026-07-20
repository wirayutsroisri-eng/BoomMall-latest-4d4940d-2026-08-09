import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { formatPrice } from "@shared/types";
import {
  Package,
  ShoppingBag,
  Clock,
  CreditCard,
  Truck,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Store,
  Upload,
  Star,
  RefreshCw,
  Copy,
  ExternalLink,
  MapPin,
  FileText,
} from "lucide-react";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type StatusKey =
  | "all"
  | "pending_payment"
  | "waiting_buyer_confirm"
  | "payment_confirmed"
  | "shipped"
  | "completed"
  | "cancelled";

const STATUS_TABS: { key: StatusKey; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "ทั้งหมด", icon: <ShoppingBag className="w-4 h-4" /> },
  { key: "pending_payment", label: "รอชำระเงิน", icon: <CreditCard className="w-4 h-4" /> },
  { key: "waiting_buyer_confirm", label: "ยอมรับเงื่อนไข", icon: <FileText className="w-4 h-4" /> },
  { key: "payment_confirmed", label: "รอส่งสินค้า", icon: <Package className="w-4 h-4" /> },
  { key: "shipped", label: "รอรับสินค้า", icon: <Truck className="w-4 h-4" /> },
  { key: "completed", label: "รอให้คะแนน", icon: <Star className="w-4 h-4" /> },
  { key: "cancelled", label: "คืนเงิน/บริการ", icon: <RefreshCw className="w-4 h-4" /> },
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  all: { label: "ทั้งหมด", className: "" },
  pending_payment: { label: "รอชำระเงิน", className: "bg-amber-100 text-amber-700 border-amber-200" },
  payment_submitted: { label: "รอยืนยันสลิป", className: "bg-orange-100 text-orange-700 border-orange-200" },
  payment_confirmed: { label: "ยืนยันแล้ว รอจัดส่ง", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  waiting_buyer_confirm: { label: "รอคุณยอมรับเงื่อนไข", className: "bg-amber-100 text-amber-700 border-amber-200" },
  seller_confirmed: { label: "พร้อมจัดส่ง", className: "bg-teal-100 text-teal-700 border-teal-200" },
  shipped: { label: "กำลังจัดส่ง", className: "bg-purple-100 text-purple-700 border-purple-200" },
  completed: { label: "สำเร็จ", className: "bg-green-100 text-green-700 border-green-200" },
  cancelled: { label: "ยกเลิกแล้ว", className: "bg-red-100 text-red-700 border-red-200" },
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MyOrdersPage() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<StatusKey>("all");
  const tabsRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch } = trpc.orders.myPurchases.useQuery(
    { limit: 50, offset: 0, status: activeTab },
    { enabled: isAuthenticated }
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center px-6">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">กรุณาเข้าสู่ระบบ</h2>
          <p className="text-muted-foreground text-sm mb-6">เพื่อดูคำสั่งซื้อของคุณ</p>
          <Button asChild className="px-8">
            <a href={getLoginUrl()}>เข้าสู่ระบบ</a>
          </Button>
        </div>
      </div>
    );
  }

  const counts = data?.counts;
  const orders = data?.items ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Header — Buyer side: blue gradient */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 sticky top-0 z-10 shadow-md">
        <div className="container max-w-2xl py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-tight" style={{ fontFamily: "Prompt, sans-serif" }}>
                  คำสั่งซื้อของฉัน
                </h1>
                <p className="text-blue-100 text-[11px] leading-tight">ติดตามสินค้าที่คุณสั่งซื้อ</p>
              </div>
            </div>
            <Link href="/seller/orders">
              <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/20 text-xs gap-1 border border-white/30">
                คำสั่งขาย <ChevronRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>

          {/* Status Tabs — horizontal scroll */}
          <div ref={tabsRef} className="flex gap-1 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
            {STATUS_TABS.map((tab) => {
              const count = counts ? (counts as any)[tab.key] : 0;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium
                    transition-all duration-150 min-w-[64px]
                    ${isActive
                      ? "bg-primary text-white shadow-sm"
                      : "bg-gray-100 dark:bg-muted text-muted-foreground hover:bg-gray-200 dark:hover:bg-muted/80"
                    }
                  `}
                >
                  <span className={isActive ? "text-white" : "text-muted-foreground"}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                  {count != null && count > 0 && tab.key !== "all" && (
                    <span className={`
                      text-[10px] font-bold leading-none px-1.5 py-0.5 rounded-full
                      ${isActive ? "bg-white/30 text-white" : "bg-primary/10 text-primary"}
                    `}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container max-w-2xl py-4">
        {isLoading ? (
          <OrderListSkeleton />
        ) : orders.length === 0 ? (
          <EmptyState status={activeTab} />
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onRefresh={refetch} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────
function OrderCard({ order, onRefresh }: { order: any; onRefresh: () => void }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const status = order.status as string;
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.pending_payment;

  const confirmReceived = trpc.orders.confirmReceived.useMutation({
    onSuccess: () => { toast.success("ยืนยันรับสินค้าแล้ว"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const cancelOrder = trpc.orders.cancelOrder.useMutation({
    onSuccess: () => {
      toast.success("ยกเลิกคำสั่งซื้อแล้ว — สินค้ากลับมาโชวในหน้าเว็บแล้ว");
      onRefresh();
      utils.products.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalAmount = parseFloat(order.totalAmount || order.amount || "0");
  const shippingFee = parseFloat(order.shippingFee || "0");

  return (
    <div className="bg-white dark:bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
      {/* Seller header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <Link href={`/shop/${order.sellerId}`}>
          <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            {order.seller?.avatar ? (
              <img src={order.seller.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <Store className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
            <span className="text-sm font-medium">{order.seller?.name ?? "ร้านค้า"}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </Link>
        <Badge variant="outline" className={`text-xs font-medium ${badge.className}`}>
          {badge.label}
        </Badge>
      </div>

      {/* Product row */}
      <Link href={`/orders/${order.id}`}>
        <div className="flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-muted/30 transition-colors">
          <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-muted">
            {order.productImage ? (
              <img src={order.productImage} alt={order.productTitle} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-8 h-8 text-muted-foreground/30" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium line-clamp-2 mb-1">{order.productTitle}</p>
            <p className="text-xs text-muted-foreground mb-2">
              {new Date(order.createdAt).toLocaleDateString("th-TH", {
                year: "numeric", month: "short", day: "numeric",
              })}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {shippingFee > 0 ? `+ ค่าส่ง ${formatPrice(shippingFee)}` : "ฟรีค่าส่ง"}
              </span>
              <span className="text-base font-bold text-primary">{formatPrice(totalAmount)}</span>
            </div>
          </div>
        </div>
      </Link>

      {/* Tracking info */}
      {order.trackingNumber && (
        <div className="mx-4 mb-3 px-3 py-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <Truck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                {order.shippingProvider && (
                  <p className="text-[11px] text-blue-500 dark:text-blue-400 mb-0.5">
                    {({
                      kerry: "Kerry Express",
                      flash: "Flash Express",
                      jnt: "J&T Express",
                      thailand_post: "ไปรษณีย์ไทย",
                      dhl: "DHL",
                      other: "อื่นๆ",
                    } as Record<string, string>)[order.shippingProvider] ?? order.shippingProvider}
                  </p>
                )}
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400">หมายเลขพัสดุ</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-blue-800 dark:text-blue-300 font-mono">{order.trackingNumber}</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(order.trackingNumber);
                    }}
                    className="text-blue-400 hover:text-blue-600 transition-colors"
                    title="คัดลอก"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate(`/tracking/${order.id}`)}
              className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 transition-colors bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded-lg"
            >
              <MapPin className="w-3 h-3" />
              ติดตามพัสดุ
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <ActionButtons
        order={order}
        status={status}
        onConfirmReceived={() => confirmReceived.mutate({ orderId: order.id })}
        onCancel={() => cancelOrder.mutate({ orderId: order.id })}
        isConfirmLoading={confirmReceived.isPending}
        isCancelLoading={cancelOrder.isPending}
        onNavigate={navigate}
      />
    </div>
  );
}

// ─── Action Buttons ───────────────────────────────────────────────────────────
function ActionButtons({
  order,
  status,
  onConfirmReceived,
  onCancel,
  isConfirmLoading,
  isCancelLoading,
  onNavigate,
}: {
  order: any;
  status: string;
  onConfirmReceived: () => void;
  onCancel: () => void;
  isConfirmLoading: boolean;
  isCancelLoading: boolean;
  onNavigate: (path: string) => void;
}) {
  const hasActions = ["pending_payment", "waiting_buyer_confirm", "payment_submitted", "payment_confirmed", "seller_confirmed", "shipped", "completed", "cancelled"].includes(status);
  if (!hasActions) return null;

  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/50">
      {/* ติดตามคำสั่งซื้อ */}
      <Button
        variant="outline"
        size="sm"
        className="text-xs h-8 rounded-full"
        onClick={() => onNavigate(`/orders/${order.id}`)}
      >
        ติดตามคำสั่งซื้อ
      </Button>

      {/* รอชำระเงิน → อัปโหลดสลิป */}
      {status === "pending_payment" && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8 rounded-full text-red-500 border-red-200 hover:bg-red-50"
            onClick={onCancel}
            disabled={isCancelLoading}
          >
            {isCancelLoading ? "กำลังยกเลิก..." : "ยกเลิก"}
          </Button>
          <Button
            size="sm"
            className="text-xs h-8 rounded-full gap-1"
            onClick={() => onNavigate(`/orders/${order.id}`)}
          >
            <Upload className="w-3.5 h-3.5" /> อัปโหลดสลิป
          </Button>
        </>
      )}

      {/* ระหว่างจัดส่ง → ยืนยันรับสินค้า */}
      {status === "shipped" && (
        <Button
          size="sm"
          className="text-xs h-8 rounded-full bg-green-600 hover:bg-green-700 text-white gap-1"
          onClick={onConfirmReceived}
          disabled={isConfirmLoading}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {isConfirmLoading ? "กำลังยืนยัน..." : "ฉันได้รับสินค้าแล้ว"}
        </Button>
      )}

      {/* สำเร็จ → รีวิว + ซื้ออีกครั้ง */}
      {status === "completed" && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8 rounded-full gap-1"
            onClick={() => onNavigate(`/products/${order.productId}`)}
          >
            <RefreshCw className="w-3.5 h-3.5" /> ซื้ออีกครั้ง
          </Button>
          <Button
            size="sm"
            className="text-xs h-8 rounded-full gap-1"
            onClick={() => onNavigate(`/orders/${order.id}#review`)}
          >
            <Star className="w-3.5 h-3.5" /> รีวิว
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ status }: { status: StatusKey }) {
  const messages: Record<StatusKey, { icon: React.ReactNode; title: string; desc: string }> = {
    all: {
      icon: <ShoppingBag className="w-14 h-14 text-muted-foreground/20" />,
      title: "ยังไม่มีคำสั่งซื้อ",
      desc: "เริ่มช้อปปิ้งและสินค้าจะปรากฏที่นี่",
    },
    pending_payment: {
      icon: <CreditCard className="w-14 h-14 text-amber-300/50" />,
      title: "ไม่มีรายการรอชำระ",
      desc: "คำสั่งซื้อที่รอการชำระเงินจะแสดงที่นี่",
    },
    waiting_buyer_confirm: {
      icon: <FileText className="w-14 h-14 text-amber-300/50" />,
      title: "ไม่มีรายการรอยอมรับ",
      desc: "คำสั่งซื้อ COD ที่รอคุณยอมรับเงื่อนไขจะแสดงที่นี่",
    },
    payment_confirmed: {
      icon: <Package className="w-14 h-14 text-indigo-300/50" />,
      title: "ไม่มีรายการรอจัดส่ง",
      desc: "ผู้ขายกำลังเตรียมพัสดุให้คุณ",
    },
    shipped: {
      icon: <Truck className="w-14 h-14 text-purple-300/50" />,
      title: "ไม่มีรายการระหว่างส่ง",
      desc: "พัสดุที่อยู่ระหว่างการจัดส่งจะแสดงที่นี่",
    },
    completed: {
      icon: <CheckCircle2 className="w-14 h-14 text-green-300/50" />,
      title: "ยังไม่มีรายการสำเร็จ",
      desc: "คำสั่งซื้อที่เสร็จสมบูรณ์จะแสดงที่นี่",
    },
    cancelled: {
      icon: <XCircle className="w-14 h-14 text-red-300/50" />,
      title: "ไม่มีรายการที่ยกเลิก",
      desc: "คำสั่งซื้อที่ถูกยกเลิกจะแสดงที่นี่",
    },
  };

  const msg = messages[status];

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="mb-4">{msg.icon}</div>
      <p className="text-base font-semibold text-foreground mb-1">{msg.title}</p>
      <p className="text-sm text-muted-foreground mb-6">{msg.desc}</p>
      {status === "all" && (
        <Link href="/products">
          <Button className="rounded-full px-8">เริ่มช้อปปิ้ง</Button>
        </Link>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function OrderListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white dark:bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
            <div className="w-6 h-6 rounded-full bg-muted" />
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="ml-auto h-5 w-20 bg-muted rounded-full" />
          </div>
          <div className="flex gap-3 px-4 py-3">
            <div className="w-20 h-20 rounded-xl bg-muted shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-5 bg-muted rounded w-1/4 ml-auto" />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border/50">
            <div className="h-8 w-24 bg-muted rounded-full" />
            <div className="h-8 w-28 bg-muted rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
