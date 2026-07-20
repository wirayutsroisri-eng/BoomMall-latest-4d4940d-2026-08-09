import { formatPrice } from "@shared/types";
import { bestWholesaleTier, hasWholesaleTiers } from "@shared/wholesale-pricing";
import { ArrowLeft, ChevronRight, MapPin, Package, Store, X } from "lucide-react";
import { useLocation } from "wouter";

type RevealProduct = {
  id: number;
  title: string;
  description?: string | null;
  price: string;
  images?: string[] | null;
  listingType?: "c2c" | "b2b" | "both";
  location?: string | null;
  sellerId: number;
  priceTiers?: { minQty: number; pricePerUnit: number }[];
};

interface FeedProductRevealProps {
  product: RevealProduct | null;
  offset: number;
  isDragging: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedProductReveal({
  product,
  offset,
  isDragging,
  isOpen,
  onClose,
}: FeedProductRevealProps) {
  const [, navigate] = useLocation();

  if (!product) return null;

  const width = typeof window !== "undefined" ? window.innerWidth : 375;
  const progress = isOpen ? 1 : Math.min(1, Math.abs(offset) / width);
  const translateX = isOpen ? 0 : width + offset;
  const images = (product.images ?? []) as string[];
  const tiers = (product.priceTiers ?? []) as { minQty: number; pricePerUnit: number }[];
  const wholesale = bestWholesaleTier(tiers);

  return (
    <>
      {/* Backdrop — tap to close */}
      <div
        className="fixed inset-0 z-[60] bg-black/50"
        style={{
          opacity: progress * 0.55,
          transition: isDragging ? "none" : "opacity 320ms ease",
          pointerEvents: progress > 0.1 ? "auto" : "none",
        }}
        onClick={onClose}
        aria-hidden
      />

      {/* Slide panel from right */}
      <div
        className="fixed inset-y-0 right-0 z-[70] w-full max-w-md bg-background shadow-2xl flex flex-col overflow-hidden"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? "none" : "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          <span className="text-sm font-semibold">รายละเอียดสินค้า</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
            aria-label="ปิด"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="aspect-[4/5] bg-muted relative">
            {images[0] ? (
              <img src={images[0]} alt={product.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-16 h-16 text-muted-foreground/30" />
              </div>
            )}
          </div>

          <div className="p-4 space-y-3">
            <h2 className="text-xl font-bold leading-snug">{product.title}</h2>
            <p className="text-2xl font-bold text-orange-600">
              {wholesale
                ? `เริ่ม ${formatPrice(wholesale.pricePerUnit)}/ชิ้น`
                : formatPrice(parseFloat(product.price))}
            </p>
            {wholesale && (
              <p className="text-xs text-red-600 font-medium">
                ราคาส่งเมื่อสั่ง {wholesale.minQty.toLocaleString("th-TH")} ชิ้นขึ้นไป
              </p>
            )}

            {hasWholesaleTiers(tiers) && tiers.length > 1 && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">ขั้นราคาส่ง</p>
                {tiers.map((t) => (
                  <div key={t.minQty} className="flex justify-between text-sm">
                    <span>{t.minQty}+ ชิ้น</span>
                    <span className="font-semibold">{formatPrice(t.pricePerUnit)}/ชิ้น</span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-100">
              💬 คุยกับผู้ขายและนัดโอนเงินนอกแอป — ไม่มีระบบชำระเงินในตัว
            </p>

            {product.location && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="w-4 h-4" /> {product.location}
              </p>
            )}

            {product.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
            )}

            {product.listingType && (
              <div className="flex gap-2">
                {(product.listingType === "c2c" || product.listingType === "both") && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                    มือสอง C2C
                  </span>
                )}
                {(product.listingType === "b2b" || product.listingType === "both") && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                    ราคาส่ง B2B
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t space-y-2 shrink-0 bg-background">
          <button
            onClick={() => navigate(`/products/${product.id}`)}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm transition-colors"
          >
            <span className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              ดูรายละเอียดสินค้า
            </span>
            <ChevronRight className="w-4 h-4 opacity-80" />
          </button>
          <button
            onClick={() => navigate(`/shop/${product.sellerId}`)}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 border-border hover:bg-muted font-semibold text-sm transition-colors"
          >
            <span className="flex items-center gap-2">
              <Store className="w-4 h-4 text-orange-600" />
              ดูโปรไฟล์ร้านค้า
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </>
  );
}
