import { CONDITION_LABELS, formatPrice } from "@shared/types";
import { Heart, MapPin } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "./ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { CountdownTimer } from "./CountdownTimer";

interface ProductCardProps {
  product: {
    id: number;
    title: string;
    price: string | number;
    images: string[] | null;
    condition: string;
    location?: string | null;
    viewCount?: number | null;
    salesCount?: number | null;
    createdAt: Date | string;
    expiresAt?: Date | string | null;
    quantity?: number | null;
    deliveryDays?: number | null;
    shippingFee?: string | number | null;
    originalPrice?: string | number | null;
    salePrice?: string | number | null;
  };
}

export default function ProductCard({ product }: ProductCardProps) {
  const images = (product.images as string[]) ?? [];
  const imageUrl = images[0] ?? null;
  const { user } = useAuth();

  // ── Like state ─────────────────────────────────────────────────────────
  const { data: likeData } = trpc.likes.getLikeStatus.useQuery(
    { productId: product.id },
    { staleTime: 30_000 }
  );
  const utils = trpc.useUtils();

  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);

  const liked = optimisticLiked ?? likeData?.liked ?? false;
  const likeCount = optimisticCount ?? likeData?.likeCount ?? 0;

  const toggleLike = trpc.likes.toggleLike.useMutation({
    onMutate: () => {
      const prevLiked = likeData?.liked ?? false;
      const prevCount = likeData?.likeCount ?? 0;
      setOptimisticLiked(!prevLiked);
      setOptimisticCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    },
    onSuccess: (data) => {
      setOptimisticLiked(null);
      setOptimisticCount(null);
      utils.likes.getLikeStatus.invalidate({ productId: product.id });
    },
    onError: () => {
      setOptimisticLiked(null);
      setOptimisticCount(null);
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
    },
  });

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.info("กรุณาเข้าสู่ระบบก่อนกดถูกใจ");
      return;
    }
    toggleLike.mutate({ productId: product.id });
  };

  return (
    <Link href={`/products/${product.id}`}>
      <div className="group cursor-pointer flex flex-col h-full">
        {/* Image container */}
        <div
          className="relative aspect-square overflow-hidden rounded-xl bg-muted mb-2.5"
          style={{ boxShadow: "0 1px 4px oklch(0.18 0.02 55 / 0.08)" }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.title}
              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300 ease-out"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <svg
                className="w-10 h-10 text-muted-foreground/20"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
          {/* Out of stock overlay */}
          {product.quantity === 0 && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl z-10">
              <span className="text-white text-sm font-bold px-3 py-1.5 bg-black/60 rounded-lg">สินค้าหมด</span>
            </div>
          )}
          {/* Condition badge — มือ 1 / มือ 2 */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {/* มือ 1 = new, มือ 2 = อื่นๆ */}
            <Badge
              className={`text-[10px] px-2 py-0.5 border-0 shadow-sm font-bold ${
                product.condition === "new"
                  ? "bg-emerald-500 text-white"
                  : "bg-amber-500 text-white"
              }`}
            >
              {product.condition === "new" ? "มือ 1" : "มือ 2"}
            </Badge>
            {/* sub-condition label */}
            {product.condition !== "new" && (
              <Badge
                variant="secondary"
                className="text-[10px] px-2 py-0.5 bg-white/90 backdrop-blur-sm text-foreground border-0 shadow-sm font-medium"
              >
                {CONDITION_LABELS[product.condition] ?? product.condition}
              </Badge>
            )}
          </div>
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors duration-200 rounded-xl" />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1 px-0.5 flex-1">
          <p className="text-sm font-medium line-clamp-2 text-foreground leading-snug group-hover:text-primary transition-colors duration-150">
            {product.title}
          </p>
          {/* Price row */}
          {(() => {
            const saleP = product.salePrice ? parseFloat(String(product.salePrice)) : null;
            const origP = product.originalPrice ? parseFloat(String(product.originalPrice)) : null;
            const baseP = parseFloat(String(product.price));
            const displayP = saleP ?? baseP;
            const strikeP = saleP ? (origP ?? baseP) : origP;
            const discountPct = strikeP && strikeP > displayP ? Math.round((1 - displayP / strikeP) * 100) : null;
            return (
              <div className="mt-0.5">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-base font-bold text-primary">{formatPrice(displayP)}</span>
                  {strikeP && strikeP > displayP && (
                    <span className="text-[11px] text-muted-foreground line-through">{formatPrice(strikeP)}</span>
                  )}
                  {discountPct && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none">{discountPct}%</span>
                  )}
                </div>
                {product.shippingFee && parseFloat(String(product.shippingFee)) > 0 && (
                  <span className="text-[10px] font-normal text-muted-foreground">+ค่าส่ง {formatPrice(product.shippingFee)}</span>
                )}
              </div>
            );
          })()}
          {/* Delivery days + low stock + sales badges */}
          {(product.deliveryDays || (product.salesCount && product.salesCount > 0) || ((product.quantity ?? 99) <= 3 && (product.quantity ?? 99) > 0)) && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {product.salesCount !== null && product.salesCount !== undefined && product.salesCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100">📦 ขายแล้ว {product.salesCount} ชิ้น</span>
              )}
              {product.deliveryDays && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-100">⏱ จัดส่งภายใน {product.deliveryDays} วัน</span>
              )}
              {(product.quantity ?? 99) <= 3 && (product.quantity ?? 99) > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">⚠️ เหลือ {product.quantity} ชิ้น</span>
              )}
            </div>
          )}

          {/* Countdown timer */}
          {product.expiresAt && (
            <CountdownTimer
              expiresAt={product.expiresAt}
              variant="compact"
              className="mt-0.5"
            />
          )}

          {/* Bottom row: location + like */}
          <div className="flex items-center justify-between mt-auto pt-1">
            {product.location ? (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate max-w-[80px]">{product.location}</span>
              </span>
            ) : (
              <span />
            )}

            {/* Heart button */}
            <button
              onClick={handleLike}
              className="flex items-center gap-1 group/heart"
              aria-label={liked ? "เลิกถูกใจ" : "ถูกใจ"}
            >
              <Heart
                className={`w-4 h-4 transition-all duration-200 ${
                  liked
                    ? "fill-rose-500 stroke-rose-500 scale-110"
                    : "stroke-muted-foreground group-hover/heart:stroke-rose-400"
                }`}
              />
              {likeCount > 0 && (
                <span
                  className={`text-[11px] font-medium transition-colors duration-200 ${
                    liked ? "text-rose-500" : "text-muted-foreground group-hover/heart:text-rose-400"
                  }`}
                >
                  {likeCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
