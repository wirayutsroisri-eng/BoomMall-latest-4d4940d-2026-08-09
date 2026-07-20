import { useState } from "react";
import { Link } from "wouter";
import ShipOrderDialog from "@/components/ShipOrderDialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatDate, formatPrice, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  AlertCircle,
  ChevronRight,
  User,
  MapPin,
  Phone,
  Image as ImageIcon,
  Store,
  ShoppingBag,
  Trash2,
  Copy,
  ExternalLink,
  CalendarDays,
} from "lucide-react";

type StatusFilter =
  | "all"
  | "pending_payment"
  | "waiting_buyer_confirm"
  | "seller_confirmed"
  | "payment_submitted"
  | "payment_confirmed"
  | "shipped"
  | "completed"
  | "cancelled";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "pending_payment", label: "รอยืนยัน" },
  { value: "waiting_buyer_confirm", label: "รอผู้ซื้อยอมรับ" },
  { value: "payment_submitted", label: "รอยืนยันสลิป" },
  { value: "payment_confirmed", label: "รอจัดส่ง" },
  { value: "seller_confirmed", label: "พร้อมจัดส่ง" },
  { value: "shipped", label: "จัดส่งแล้ว" },
  { value: "completed", label: "สำเร็จ" },
  { value: "cancelled", label: "ยกเลิก" },
];

export default function SellerOrdersPage() {
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState<StatusFilter>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [shippingProviderInput, setShippingProviderInput] = useState("");
  const [selectedOrderForShip, setSelectedOrderForShip] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showShipDialog, setShowShipDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showSlipDialog, setShowSlipDialog] = useState(false);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  // Confirm COD order dialog
  const [showConfirmCodDialog, setShowConfirmCodDialog] = useState(false);
  const [selectedOrderForConfirm, setSelectedOrderForConfirm] = useState<any | null>(null);
  const [estimatedShipDate, setEstimatedShipDate] = useState("");

  // Track which order IDs the seller has already viewed the slip for
  const [viewedSlips, setViewedSlips] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.orders.mySales.useQuery(
    { limit: 50, offset: 0, status: activeTab },
    { enabled: isAuthenticated, staleTime: 0 }
  );

  const confirmPayment = trpc.orders.sellerConfirmPayment.useMutation({
    onSuccess: () => {
      toast.success("ยืนยันการรับเงินแล้ว");
      utils.orders.mySales.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectPayment = trpc.orders.sellerRejectPayment.useMutation({
    onSuccess: () => {
      toast.success("ปฏิเสธสลิปแล้ว — ผู้ซื้อต้องอัปโหลดใหม่");
      setShowRejectDialog(false);
      setRejectReason("");
      utils.orders.mySales.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markShipped = trpc.orders.markShipped.useMutation({
    onSuccess: () => {
      toast.success("บันทึกการจัดส่งแล้ว ✔️");
      setShowShipDialog(false);
      setTrackingInput("");
      setShippingProviderInput("");
      setSelectedOrderForShip(null);
      utils.orders.mySales.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelOrder = trpc.orders.cancelOrder.useMutation({
    onSuccess: () => {
      toast.success("ยกเลิกออเดอร์แล้ว — สินค้ากลับมาโชวในหน้าร้านแล้ว");
      setShowCancelDialog(false);
      setCancelReason("");
      utils.orders.mySales.invalidate();
      utils.products.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteOrder = trpc.orders.deleteOrder.useMutation({
    onSuccess: () => {
      toast.success("ลบรายการออเดอร์แล้ว");
      utils.orders.mySales.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Confirm COD order: mark product sold + send chat message
  const confirmCodOrder = trpc.orders.confirmOrder.useMutation({
    onSuccess: () => {
      toast.success("✅ ยืนยันรับออเดอร์แล้ว — สินค้าถูกลบออกจาก feed และส่งแจ้งผู้ซื้อในแชตแล้ว");
      setShowConfirmCodDialog(false);
      setSelectedOrderForConfirm(null);
      setEstimatedShipDate("");
      utils.orders.mySales.invalidate();
      utils.products.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isAuthenticated) {
    return (
      <div className="container py-16 text-center">
        <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold mb-2">กรุณาเข้าสู่ระบบ</h2>
        <Link href="/"><Button>กลับหน้าหลัก</Button></Link>
      </div>
    );
  }

  if (!user?.isSeller) {
    return (
      <div className="container py-16 text-center">
        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold mb-2">เฉพาะผู้ขายเท่านั้น</h2>
        <p className="text-muted-foreground mb-4">คุณยังไม่ได้เปิดใช้งานโหมดผู้ขาย</p>
        <Link href="/seller/dashboard"><Button>ไปที่แดชบอร์ดผู้ขาย</Button></Link>
      </div>
    );
  }

  const orders = data?.items ?? [];
  const counts = data?.counts;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Header — Seller side: orange gradient */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 sticky top-0 z-10 shadow-md">
        <div className="container max-w-4xl py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-tight" style={{ fontFamily: "Prompt, sans-serif" }}>
                  คำสั่งขายของฉัน
                </h1>
                <p className="text-orange-100 text-[11px] leading-tight">จัดการออเดอร์จากผู้ซื้อทั้งหมด</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/my-orders">
                <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/20 text-xs gap-1 border border-white/30">
                  <ShoppingBag className="w-3.5 h-3.5" /> การซื้อ
                </Button>
              </Link>
              <Link href="/seller/dashboard">
                <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/20 text-xs gap-1 border border-white/30">
                  แดชบอร์ด
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6 max-w-4xl">
        {/* Summary cards */}
        {counts && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <SummaryCard
              label="รอยืนยัน (COD)"
              count={(counts as any).pending_payment ?? 0}
              icon={<AlertCircle className="w-4 h-4" />}
              urgent
            />
            <SummaryCard
              label="รอจัดส่ง"
              count={((counts as any).payment_confirmed ?? 0) + ((counts as any).seller_confirmed ?? 0)}
              icon={<Package className="w-4 h-4" />}
            />
            <SummaryCard
              label="จัดส่งแล้ว"
              count={(counts as any).shipped ?? 0}
              icon={<Truck className="w-4 h-4" />}
            />
            <SummaryCard
              label="สำเร็จแล้ว"
              count={(counts as any).completed ?? 0}
              icon={<CheckCircle className="w-4 h-4" />}
              success
            />
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as StatusFilter)}>
          <TabsList className="flex flex-wrap gap-1 h-auto mb-6 bg-muted/50 p-1">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                {tab.label}
                {counts && tab.value !== "all" && (counts as any)[tab.value] > 0 && (
                  <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                    {(counts as any)[tab.value]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {STATUS_TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-28 rounded-xl" />
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>ไม่มีออเดอร์ในหมวดนี้</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      hasViewedSlip={viewedSlips.has(order.id)}
                      onConfirmPayment={() => {
                        confirmPayment.mutate({ orderId: order.id });
                      }}
                      onConfirmCodOrder={() => {
                        setSelectedOrderForConfirm(order);
                        setShowConfirmCodDialog(true);
                      }}
                      onRejectPayment={() => {
                        setSelectedOrderId(order.id);
                        setShowRejectDialog(true);
                      }}
                      onMarkShipped={() => {
                        setSelectedOrderId(order.id);
                        setSelectedOrderForShip(order);
                        setShowShipDialog(true);
                      }}
                      onCancel={() => {
                        setSelectedOrderId(order.id);
                        setShowCancelDialog(true);
                      }}
                      onViewSlip={(url) => {
                        setViewedSlips((prev) => new Set(prev).add(order.id));
                        setSlipUrl(url);
                        setShowSlipDialog(true);
                      }}
                      onDelete={() => {
                        if (window.confirm("ลบรายการออเดอร์นี้ออกจากรายการของคุณ?")) {
                          deleteOrder.mutate({ id: order.id });
                        }
                      }}
                      isConfirming={confirmPayment.isPending}
                      isConfirmingCod={confirmCodOrder.isPending}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <ShipOrderDialog
        open={showShipDialog}
        onOpenChange={(open) => {
          setShowShipDialog(open);
          if (!open) setSelectedOrderForShip(null);
        }}
        order={selectedOrderForShip}
        onConfirm={(params) => markShipped.mutate(params)}
        isPending={markShipped.isPending}
      />

      {/* Confirm COD Order Dialog */}
      <Dialog open={showConfirmCodDialog} onOpenChange={(open) => {
        setShowConfirmCodDialog(open);
        if (!open) { setSelectedOrderForConfirm(null); setEstimatedShipDate(""); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-teal-600" />
              ยืนยันรับออเดอร์
            </DialogTitle>
          </DialogHeader>
          {selectedOrderForConfirm && (
            <div className="space-y-4 py-2">
              {/* Order summary */}
              <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm truncate pr-2">{selectedOrderForConfirm.productTitle}</p>
                  <p className="text-orange-600 font-bold shrink-0">{(() => {
                    const tot = parseFloat(selectedOrderForConfirm.totalAmount || "0");
                    const amt = parseFloat(selectedOrderForConfirm.amount || "0");
                    const ship = parseFloat(selectedOrderForConfirm.shippingFee || "0");
                    const display = tot > 0 ? tot : amt + ship + Math.ceil(amt * 0.03);
                    return formatPrice(display);
                  })()}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-orange-600 font-medium">
                  <Truck className="w-3.5 h-3.5" />
                  COD — เก็บเงินปลายทาง
                </div>
                {selectedOrderForConfirm.shippingAddress && (
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{selectedOrderForConfirm.shippingAddress}</span>
                  </div>
                )}
              </div>

              {/* Estimated ship date */}
              <div className="space-y-1.5">
                <Label htmlFor="ship-date" className="flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  วันที่คาดว่าจะจัดส่ง
                </Label>
                <Input
                  id="ship-date"
                  type="date"
                  value={estimatedShipDate}
                  onChange={(e) => setEstimatedShipDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  ระบบจะส่งข้อความในแชตแจ้งผู้ซื้อโดยอัตโนมัติ
                </p>
              </div>

              {/* What happens */}
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-teal-800">เมื่อยืนยัน ระบบจะ:</p>
                <ul className="text-xs text-teal-700 space-y-1">
                  <li>✅ ลบสินค้าออกจาก feed ทันที</li>
                  <li>💬 ส่งข้อความแชตแจ้งผู้ซื้อพร้อมวันจัดส่ง</li>
                  <li>📦 เปลี่ยนสถานะออเดอร์เป็น "ยืนยันแล้ว รอจัดส่ง"</li>
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmCodDialog(false)}>ยกเลิก</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => {
                if (!selectedOrderForConfirm) return;
                confirmCodOrder.mutate({
                  orderId: selectedOrderForConfirm.id,
                  estimatedShipDate: estimatedShipDate || undefined,
                });
              }}
              disabled={confirmCodOrder.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              {confirmCodOrder.isPending ? "กำลังยืนยัน..." : "ยืนยันรับออเดอร์"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยกเลิกออเดอร์</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="cancel-reason">เหตุผล (ไม่บังคับ)</Label>
              <Textarea
                id="cancel-reason"
                placeholder="เช่น สินค้าหมดสต็อก, ผู้ซื้อขอยกเลิก..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>ไม่ยกเลิก</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!selectedOrderId) return;
                cancelOrder.mutate({
                  orderId: selectedOrderId,
                  reason: cancelReason || undefined,
                });
              }}
              disabled={cancelOrder.isPending}
            >
              {cancelOrder.isPending ? "กำลังยกเลิก..." : "ยืนยันการยกเลิก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Payment Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปฏิเสธสลิปการชำระเงิน</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              ผู้ซื้อจะต้องอัปโหลดสลิปใหม่อีกครั้ง
            </p>
            <div>
              <Label htmlFor="reject-reason">เหตุผล (ไม่บังคับ)</Label>
              <Textarea
                id="reject-reason"
                placeholder="เช่น สลิปไม่ชัด, ยอดเงินไม่ตรง..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>ยกเลิก</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!selectedOrderId) return;
                rejectPayment.mutate({
                  orderId: selectedOrderId,
                  reason: rejectReason || undefined,
                });
              }}
              disabled={rejectPayment.isPending}
            >
              {rejectPayment.isPending ? "กำลังปฏิเสธ..." : "ปฏิเสธสลิป"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slip Image Dialog */}
      <Dialog open={showSlipDialog} onOpenChange={setShowSlipDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>สลิปการชำระเงิน</DialogTitle>
          </DialogHeader>
          {slipUrl && (
            <div className="flex justify-center py-2">
              <img
                src={slipUrl}
                alt="สลิปการชำระเงิน"
                className="max-h-[60vh] rounded-lg object-contain"
              />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowSlipDialog(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Summary Card ──────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  count,
  icon,
  urgent,
  success,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  urgent?: boolean;
  success?: boolean;
}) {
  return (
    <Card className={`${urgent && count > 0 ? "border-orange-300 bg-orange-50" : ""} ${success ? "border-green-200 bg-green-50/50" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className={urgent && count > 0 ? "text-orange-500" : success ? "text-green-600" : "text-muted-foreground"}>
            {icon}
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${urgent && count > 0 ? "text-orange-600" : success ? "text-green-700" : ""}`}>
          {count}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Order Card ────────────────────────────────────────────────────────────────
function OrderCard({
  order,
  hasViewedSlip,
  onConfirmPayment,
  onConfirmCodOrder,
  onRejectPayment,
  onMarkShipped,
  onCancel,
  onViewSlip,
  onDelete,
  isConfirming,
  isConfirmingCod,
}: {
  order: any;
  hasViewedSlip: boolean;
  onConfirmPayment: () => void;
  onConfirmCodOrder: () => void;
  onRejectPayment: () => void;
  onMarkShipped: () => void;
  onCancel: () => void;
  onViewSlip: (url: string) => void;
  onDelete: () => void;
  isConfirming: boolean;
  isConfirmingCod: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = ORDER_STATUS_COLORS[order.status as keyof typeof ORDER_STATUS_COLORS] ?? "bg-gray-100 text-gray-800";
  const statusLabel = ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status;

  const isCod = order.paymentMethod === "cod";
  const isWallet = order.paymentMethod === "wallet";

  // COD pending_payment/payment_confirmed → ผู้ขายต้องยืนยันรับออเดอร์ก่อน
  const canConfirmCod = isCod && (order.status === "pending_payment" || order.status === "payment_confirmed");
  // Wallet payment_submitted → ยืนยันสลิป
  const canConfirm = order.status === "payment_submitted";
  // Ready to ship: payment_confirmed (non-COD only) หรือ seller_confirmed (COD)
  const canShip = (!isCod && order.status === "payment_confirmed") || order.status === "seller_confirmed";
  const canCancel = ["pending_payment", "payment_submitted", "waiting_buyer_confirm", "seller_confirmed"].includes(order.status);
  const canDelete = ["cancelled", "completed", "refunded"].includes(order.status);

  const isUrgent = order.status === "payment_submitted" || canConfirmCod;

  // Seller must view the slip before confirming payment
  const hasSlip = !!order.latestSlip;
  const confirmBlocked = canConfirm && hasSlip && !hasViewedSlip;

  return (
    <Card className={`transition-all ${isUrgent ? "border-orange-300 shadow-sm" : ""}`}>
      <CardContent className="p-4">
        {/* Main row */}
        <div className="flex items-start gap-3">
          {/* Product image */}
          {order.productImage ? (
            <img
              src={order.productImage}
              alt={order.productTitle}
              className="w-14 h-14 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-muted-foreground/30" />
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{order.productTitle}</p>
                <p className="text-primary font-bold">{(() => {
                  const tot = parseFloat(order.totalAmount || "0");
                  const amt = parseFloat(order.amount || "0");
                  const ship = parseFloat(order.shippingFee || "0");
                  const display = tot > 0 ? tot : (isCod ? amt + ship + Math.ceil(amt * 0.03) : amt + ship);
                  return formatPrice(display);
                })()}</p>
              </div>
              <Badge className={`${statusColor} shrink-0 text-xs`}>{statusLabel}</Badge>
            </div>

            {/* Payment method + shipping fee badges */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {isCod && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
                  <Truck className="w-2.5 h-2.5" /> COD
                </span>
              )}
              {isWallet && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                  Wallet
                </span>
              )}
              {order.shippingFee > 0 && (
                <span className="text-[10px] text-muted-foreground">+ค่าขนส่ง {formatPrice(order.shippingFee)}</span>
              )}
            </div>

            {/* Buyer info */}
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              <span>ผู้ซื้อ: {order.buyer?.name ?? "ไม่ระบุ"}</span>
              {order.buyer?.phone && (
                <>
                  <span className="mx-1">·</span>
                  <Phone className="w-3 h-3" />
                  <span>{order.buyer.phone}</span>
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-0.5">
              <Clock className="w-3 h-3 inline mr-1" />
              {formatDate(order.createdAt)}
            </p>
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
          >
            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-3">
            {/* Shipping address */}
            {order.shippingAddress && (
              <div className="flex gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">ที่อยู่จัดส่ง</p>
                  <p>{order.shippingAddress}</p>
                </div>
              </div>
            )}

            {/* Shipping provider + tracking */}
            {(order.shippingProvider || order.trackingNumber) && (
              <div className="flex gap-2 text-sm">
                <Truck className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  {order.shippingProvider && (
                    <p className="text-xs font-medium text-muted-foreground">
                      ขนส่ง: <span className="text-foreground font-semibold">{({
                        kerry: "Kerry Express",
                        flash: "Flash Express",
                        jnt: "J&T Express",
                        thailand_post: "ไปรษณีย์ไทย",
                        dhl: "DHL",
                        other: "อื่นๆ",
                      } as Record<string, string>)[order.shippingProvider] ?? order.shippingProvider}</span>
                    </p>
                  )}
                  {order.trackingNumber && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">หมายเลขพัสดุ</p>
                      <div className="flex items-center gap-2">
                        <p className="font-mono font-medium">{order.trackingNumber}</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(order.trackingNumber!);
                            toast.success("คัดลอกเลขพัสดุแล้ว");
                          }}
                          className="p-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                          title="คัดลอก"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Payment method detail */}
            {(isCod || isWallet) && (
              <div className="flex gap-2 text-sm">
                <div className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">วิธีชำระเงิน</p>
                  <p className={isCod ? "text-orange-600 font-medium" : "text-blue-600 font-medium"}>
                    {isCod ? "เก็บเงินปลายทาง (COD)" : "หักจาก Wallet เรียบร้อยแล้ว"}
                  </p>
                </div>
              </div>
            )}

            {/* Slip */}
            {order.latestSlip && (
              <div className="flex gap-2 text-sm">
                <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">สลิปการชำระเงิน</p>
                  <button
                    onClick={() => onViewSlip(order.latestSlip.slipUrl)}
                    className="flex items-center gap-1 text-primary hover:underline text-sm"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    ดูสลิป
                    {hasViewedSlip && (
                      <span className="ml-1 text-green-600 text-xs">(ดูแล้ว ✓)</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Note */}
            {order.note && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                <p className="font-medium text-xs mb-0.5">หมายเหตุ</p>
                <p>{order.note}</p>
              </div>
            )}

            {/* Order ID */}
            <p className="text-xs text-muted-foreground">ออเดอร์ #{order.id}</p>
          </div>
        )}

        {/* Action buttons */}
        {(canConfirmCod || canConfirm || canShip || canCancel) && (
          <div className="mt-3 pt-3 border-t space-y-2">
            {/* COD confirm banner */}
            {canConfirmCod && (
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                <p className="text-xs text-orange-700 font-medium flex-1">
                  ออเดอร์ COD ใหม่ — กรุณายืนยันรับออเดอร์
                </p>
              </div>
            )}

            {/* Slip view reminder */}
            {confirmBlocked && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Eye className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 font-medium">
                  กรุณาดูสลิปก่อนยืนยันรับเงิน
                </p>
                <button
                  onClick={() => {
                    setExpanded(true);
                    onViewSlip(order.latestSlip.slipUrl);
                  }}
                  className="ml-auto text-xs text-primary underline font-semibold shrink-0"
                >
                  ดูสลิป
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {/* COD: ยืนยันรับออเดอร์ */}
              {canConfirmCod && (
                <Button
                  size="sm"
                  onClick={onConfirmCodOrder}
                  disabled={isConfirmingCod}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  {isConfirmingCod ? "กำลังยืนยัน..." : "ยืนยันรับออเดอร์"}
                </Button>
              )}

              {/* Wallet: ยืนยันสลิป */}
              {canConfirm && (
                <>
                  <Button
                    size="sm"
                    onClick={onConfirmPayment}
                    disabled={isConfirming || confirmBlocked}
                    className={`${confirmBlocked ? "opacity-50 cursor-not-allowed" : ""} bg-green-600 hover:bg-green-700 text-white`}
                    title={confirmBlocked ? "กรุณาดูสลิปก่อนยืนยัน" : undefined}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />
                    {isConfirming ? "กำลังยืนยัน..." : "ยืนยันรับเงิน"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onRejectPayment}
                    className="border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    ปฏิเสธสลิป
                  </Button>
                </>
              )}

              {/* บันทึกการจัดส่ง */}
              {canShip && (
                <Button
                  size="sm"
                  onClick={onMarkShipped}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Truck className="w-3.5 h-3.5 mr-1" />
                  บันทึกการจัดส่ง
                </Button>
              )}

              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCancel}
                  className="border-red-200 text-red-600 hover:bg-red-50 ml-auto"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  ยกเลิกออเดอร์
                </Button>
              )}
            </div>
          </div>
        )}

        {canDelete && (
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="text-muted-foreground hover:text-red-600 hover:bg-red-50 text-xs h-7"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              ลบรายการ
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
