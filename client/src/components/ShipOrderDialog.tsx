import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck, MapPin, Phone, Copy, ExternalLink } from "lucide-react";
import { formatPrice } from "@shared/types";

const PROVIDERS = [
  { id: "kerry", label: "Kerry", color: "bg-red-50 border-red-200 text-red-700" },
  { id: "flash", label: "Flash", color: "bg-yellow-50 border-yellow-200 text-yellow-700" },
  { id: "jnt", label: "J&T", color: "bg-orange-50 border-orange-200 text-orange-700" },
  { id: "thailand_post", label: "ไปรษณีย์", color: "bg-blue-50 border-blue-200 text-blue-700" },
  { id: "dhl", label: "DHL", color: "bg-yellow-50 border-yellow-200 text-yellow-800" },
  { id: "other", label: "อื่นๆ", color: "bg-gray-50 border-gray-200 text-gray-700" },
] as const;

const TRACKING_URLS: Record<string, (t: string) => string> = {
  kerry: (t) => `https://th.kerryexpress.com/th/track/?track=${t}`,
  flash: (t) => `https://www.flashexpress.co.th/tracking/?se=${t}`,
  jnt: (t) => `https://www.jtexpress.co.th/trajectoryQuery?billCodes=${t}`,
  thailand_post: (t) => `https://track.thailandpost.co.th/?trackNumber=${t}`,
  dhl: (t) => `https://www.dhl.com/th-th/home/tracking/tracking-express.html?submit=1&tracking-id=${t}`,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any | null;
  onConfirm: (params: { orderId: number; trackingNumber?: string; shippingProvider?: string }) => void;
  isPending: boolean;
}

export default function ShipOrderDialog({ open, onOpenChange, order, onConfirm, isPending }: Props) {
  const [trackingInput, setTrackingInput] = useState("");
  const [providerInput, setProviderInput] = useState("");

  const handleClose = (v: boolean) => {
    if (!v) {
      setTrackingInput("");
      setProviderInput("");
    }
    onOpenChange(v);
  };

  const isCod = order?.paymentMethod === "cod";
  // Fallback: ถ้า totalAmount เป็น 0 หรือ null ให้คำนวณใหม่จาก amount + shippingFee + 3% COD
  const rawTotal = parseFloat(order?.totalAmount || "0");
  const rawAmount = parseFloat(order?.amount || "0");
  const rawShipping = parseFloat(order?.shippingFee || "0");
  const totalAmt = rawTotal > 0 ? rawTotal
    : isCod
      ? rawAmount + rawShipping + Math.ceil(rawAmount * 0.03)
      : rawAmount + rawShipping;

  const handleCopyAddress = () => {
    if (!order) return;
    const name = order.buyer?.name ?? "";
    const phone = order.buyer?.phone ?? "";
    const addr = order.shippingAddress ?? "";
    const price = totalAmt.toLocaleString("th-TH", { minimumFractionDigits: 2 });
    const lines = [
      "📦 ที่อยู่จัดส่ง",
      `ชื่อ: ${name}${phone ? ` | โทร: ${phone}` : ""}`,
      addr,
      isCod ? `💵 COD เก็บเงิน: ฿${price}` : `ราคา: ฿${price}`,
      `ออเดอร์ #${order.id}`,
    ].join("\n");
    navigator.clipboard.writeText(lines).then(() => toast.success("คัดลอกที่อยู่แล้ว ✔️"));
  };

  const trackingUrl =
    trackingInput && providerInput && providerInput !== "other"
      ? TRACKING_URLS[providerInput]?.(trackingInput)
      : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-600" />
            บันทึกการจัดส่ง
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Order summary */}
          {order && (
            <div className="bg-muted/60 rounded-xl p-3 space-y-2 text-sm border">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate mr-2">{order.productTitle}</span>
                <span className={`font-bold shrink-0 ${isCod ? "text-orange-600" : "text-primary"}`}>
                  ฿{totalAmt.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {isCod && (
                <p className="text-[11px] text-orange-700 font-semibold bg-orange-50 border border-orange-200 rounded px-2 py-1">
                  COD — เก็บเงินปลายทางจากผู้ซื้อเมื่อส่งถึง
                </p>
              )}

              {order.shippingAddress && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1">{order.shippingAddress}</p>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                    title="คัดลอกที่อยู่"
                  >
                    <Copy className="w-3.5 h-3.5 text-primary" />
                  </button>
                </div>
              )}

              {order.buyer?.phone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{order.buyer.phone}</span>
                </div>
              )}
            </div>
          )}

          {/* Shipping provider */}
          <div>
            <Label className="text-sm font-medium">ขนส่งที่ใช้</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProviderInput(p.id === providerInput ? "" : p.id)}
                  className={`border rounded-lg py-2 px-1 text-xs font-semibold transition-all ${
                    providerInput === p.id
                      ? `${p.color} ring-2 ring-offset-1 ring-primary`
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tracking number */}
          <div>
            <Label htmlFor="tracking" className="text-sm font-medium">หมายเลขพัสดุ</Label>
            <Input
              id="tracking"
              placeholder="เช่น TH123456789 (ไม่จำเป็น)"
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              className="mt-1"
            />
            {trackingUrl && (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                ตรวจสอบสถานะพัสดุ
              </a>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            เมื่อยืนยัน ผู้ซื้อจะได้รับแจ้งว่าสินค้าถูกจัดส่งแล้ว
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>ยกเลิก</Button>
          <Button
            onClick={() => {
              if (!order) return;
              onConfirm({
                orderId: order.id,
                trackingNumber: trackingInput || undefined,
                shippingProvider: providerInput || undefined,
              });
            }}
            disabled={isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Truck className="w-3.5 h-3.5 mr-1.5" />
            {isPending ? "กำลังบันทึก..." : "ยืนยันการจัดส่ง"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
