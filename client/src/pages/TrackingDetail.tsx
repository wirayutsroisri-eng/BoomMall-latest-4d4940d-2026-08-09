import { useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Copy,
  ExternalLink,
  Store,
  Navigation,
  AlertCircle,
} from "lucide-react";

// ─── Shipping provider labels ─────────────────────────────────────────────────
const PROVIDER_LABELS: Record<string, string> = {
  kerry: "Kerry Express",
  flash: "Flash Express",
  jnt: "J&T Express",
  thailand_post: "ไปรษณีย์ไทย",
  dhl: "DHL",
  other: "อื่นๆ",
};

// ─── Tracking URLs per provider ───────────────────────────────────────────────
const TRACKING_URLS: Record<string, (tracking: string) => string> = {
  kerry: (t) => `https://th.kerryexpress.com/th/track/?track=${t}`,
  flash: (t) => `https://www.flashexpress.co.th/tracking/?se=${t}`,
  jnt: (t) => `https://www.jtexpress.co.th/index/query/gzquery.html?bills=${t}`,
  thailand_post: (t) => `https://track.thailandpost.co.th/?trackNumber=${t}`,
  dhl: (t) => `https://www.dhl.com/th-th/home/tracking.html?tracking-id=${t}`,
  other: (t) => `https://www.17track.net/th/track#nums=${t}`,
};

// ─── Status timeline steps ────────────────────────────────────────────────────
type TimelineStep = {
  status: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
};

const TIMELINE_STEPS: TimelineStep[] = [
  {
    status: "pending_payment",
    label: "สั่งซื้อแล้ว",
    desc: "รอการชำระเงิน / รอผู้ขายยืนยัน",
    icon: <Clock className="w-4 h-4" />,
  },
  {
    status: "seller_confirmed",
    label: "ผู้ขายยืนยันแล้ว",
    desc: "ผู้ขายรับออเดอร์และกำลังเตรียมพัสดุ",
    icon: <Store className="w-4 h-4" />,
  },
  {
    status: "payment_confirmed",
    label: "ชำระเงินแล้ว",
    desc: "ยืนยันการชำระเงินเรียบร้อย",
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  {
    status: "shipped",
    label: "จัดส่งแล้ว",
    desc: "พัสดุอยู่ระหว่างการขนส่ง",
    icon: <Truck className="w-4 h-4" />,
  },
  {
    status: "completed",
    label: "ได้รับสินค้าแล้ว",
    desc: "ยืนยันรับสินค้าเรียบร้อย",
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
];

// ─── Status order for progress calculation ────────────────────────────────────
const STATUS_ORDER = [
  "pending_payment",
  "payment_submitted",
  "seller_confirmed",
  "payment_confirmed",
  "shipped",
  "completed",
];

function getStepIndex(status: string): number {
  // Map payment_submitted → seller_confirmed for timeline display
  if (status === "payment_submitted") return STATUS_ORDER.indexOf("seller_confirmed");
  return STATUS_ORDER.indexOf(status);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TrackingDetailPage() {
  const [, params] = useRoute("/tracking/:orderId");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const orderId = params?.orderId ? parseInt(params.orderId) : null;

  const { data: order, isLoading } = trpc.orders.getById.useQuery(
    { id: orderId! },
    { enabled: !!orderId && isAuthenticated }
  );

  // ─── Map initialization ───────────────────────────────────────────────────
  function handleMapReady(map: google.maps.Map) {
    mapRef.current = map;
    if (order?.shippingAddress) {
      geocodeAndShowRoute(map, order.shippingAddress, order.shippingProvider ?? "");
    }
  }

  function geocodeAndShowRoute(map: google.maps.Map, address: string, provider: string) {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const destLocation = results[0].geometry.location;
        map.setCenter(destLocation);
        map.setZoom(13);

        // Destination marker (buyer's address)
        const destMarker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: destLocation,
          title: "ที่อยู่จัดส่ง",
        });
        markersRef.current.push(destMarker);

        // Info window for destination
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="font-family: 'Prompt', sans-serif; padding: 4px 8px;">
            <p style="font-weight: 600; font-size: 13px; margin: 0 0 2px;">📦 ที่อยู่จัดส่ง</p>
            <p style="font-size: 12px; color: #555; margin: 0;">${address}</p>
          </div>`,
        });
        destMarker.addListener("click", () => {
          infoWindow.open(map, destMarker);
        });
        infoWindow.open(map, destMarker);
      }
    });
  }

  // ─── Re-geocode when order loads ─────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current && order?.shippingAddress) {
      // Clear old markers
      markersRef.current.forEach((m) => { m.map = null; });
      markersRef.current = [];
      geocodeAndShowRoute(mapRef.current, order.shippingAddress, order.shippingProvider ?? "");
    }
  }, [order?.shippingAddress]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">กรุณาเข้าสู่ระบบ</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-16 sticky top-0 z-10" />
        <div className="container max-w-2xl py-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-border" />
          ))}
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">ไม่พบข้อมูลออเดอร์</p>
        <Button onClick={() => navigate("/my-orders")} variant="outline">
          กลับหน้าคำสั่งซื้อ
        </Button>
      </div>
    );
  }

  const currentStepIndex = getStepIndex(order.status);
  const isCancelled = order.status === "cancelled" || order.status === "refunded";
  const hasTracking = !!order.trackingNumber;
  const providerLabel = order.shippingProvider
    ? (PROVIDER_LABELS[order.shippingProvider] ?? order.shippingProvider)
    : null;
  const trackingUrl = order.trackingNumber && order.shippingProvider
    ? (TRACKING_URLS[order.shippingProvider] ?? TRACKING_URLS.other)(order.trackingNumber)
    : order.trackingNumber
    ? TRACKING_URLS.other(order.trackingNumber)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 sticky top-0 z-10 shadow-md">
        <div className="container max-w-2xl py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/my-orders")}
              className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight" style={{ fontFamily: "Prompt, sans-serif" }}>
                ติดตามพัสดุ
              </h1>
              <p className="text-blue-100 text-[11px] leading-tight">ออเดอร์ #{order.id}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-2xl py-4 space-y-4">
        {/* Product card */}
        <div className="bg-white dark:bg-card rounded-2xl shadow-sm border border-border p-4">
          <div className="flex gap-3">
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-muted">
              {order.productImage ? (
                <img src={order.productImage} alt={order.productTitle} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-7 h-7 text-muted-foreground/30" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm line-clamp-2 mb-1">{order.productTitle}</p>
              <div className="flex items-center gap-2">
                {isCancelled ? (
                  <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">ยกเลิกแล้ว</Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                    {order.status === "shipped" ? "กำลังจัดส่ง" :
                     order.status === "completed" ? "ได้รับสินค้าแล้ว" :
                     order.status === "seller_confirmed" ? "ผู้ขายยืนยันแล้ว" :
                     order.status === "payment_confirmed" ? "รอจัดส่ง" :
                     "รอดำเนินการ"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tracking number card */}
        {hasTracking && (
          <div className="bg-white dark:bg-card rounded-2xl shadow-sm border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Truck className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">บริษัทขนส่ง</p>
                <p className="font-semibold text-sm">{providerLabel ?? "ไม่ระบุ"}</p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-0.5">หมายเลขพัสดุ</p>
                <p className="font-mono font-bold text-blue-800 dark:text-blue-200 text-base">{order.trackingNumber}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(order.trackingNumber!);
                    toast.success("คัดลอกหมายเลขพัสดุแล้ว");
                  }}
                  className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg text-blue-600 hover:bg-blue-200 transition-colors"
                  title="คัดลอก"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {trackingUrl && (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 transition-colors"
                    title="ติดตามบนเว็บขนส่ง"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>

            {order.shippedAt && (
              <p className="text-xs text-muted-foreground mt-2">
                จัดส่งเมื่อ: {new Date(order.shippedAt).toLocaleDateString("th-TH", {
                  year: "numeric", month: "long", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            )}
          </div>
        )}

        {/* Status Timeline */}
        {!isCancelled && (
          <div className="bg-white dark:bg-card rounded-2xl shadow-sm border border-border p-4">
            <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-600" />
              สถานะการจัดส่ง
            </h3>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border" />
              <div className="space-y-4">
                {TIMELINE_STEPS.map((step, idx) => {
                  const isCompleted = currentStepIndex >= idx;
                  const isCurrent = currentStepIndex === idx;
                  return (
                    <div key={step.status} className="flex gap-4 relative">
                      {/* Step dot */}
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 transition-all
                        ${isCompleted
                          ? isCurrent
                            ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                            : "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground"
                        }
                      `}>
                        {step.icon}
                      </div>
                      {/* Step content */}
                      <div className="flex-1 pb-1">
                        <p className={`text-sm font-semibold ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                          {step.label}
                          {isCurrent && (
                            <span className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                              ปัจจุบัน
                            </span>
                          )}
                        </p>
                        <p className={`text-xs ${isCompleted ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Cancelled state */}
        {isCancelled && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
            <div>
              <p className="font-semibold text-red-700 text-sm">ออเดอร์ถูกยกเลิก</p>
              <p className="text-xs text-red-500">คำสั่งซื้อนี้ถูกยกเลิกแล้ว</p>
            </div>
          </div>
        )}

        {/* Map — show when order has shipping address */}
        {order.shippingAddress && (
          <div className="bg-white dark:bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <div>
                <p className="font-semibold text-sm">แผนที่ที่อยู่จัดส่ง</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{order.shippingAddress}</p>
              </div>
            </div>
            <MapView
              className="w-full h-72"
              initialCenter={{ lat: 13.7563, lng: 100.5018 }}
              initialZoom={11}
              onMapReady={handleMapReady}
            />
          </div>
        )}

        {/* Shipping address detail */}
        {order.shippingAddress && (
          <div className="bg-white dark:bg-card rounded-2xl shadow-sm border border-border p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">ที่อยู่จัดส่ง</p>
                <p className="text-sm font-medium">{order.shippingAddress}</p>
              </div>
            </div>
          </div>
        )}

        {/* Back button */}
        <div className="pb-6">
          <Button
            variant="outline"
            className="w-full rounded-xl gap-2"
            onClick={() => navigate("/my-orders")}
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าคำสั่งซื้อ
          </Button>
        </div>
      </div>
    </div>
  );
}
