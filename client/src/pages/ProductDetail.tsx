import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { CONDITION_LABELS, formatDate, formatPrice, CHAT_MODE_LABELS, CHAT_MODE_COLORS } from "@shared/types";
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Facebook,
  Heart,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Share2,
  ShoppingCart,
  Star,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Zap,
  Store,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { CountdownTimer } from "@/components/CountdownTimer";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const productId = parseInt(id ?? "0");
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [currentImage, setCurrentImage] = useState(0);
  const utils = trpc.useUtils();

  const addToCart = trpc.cart.addItem.useMutation({
    onSuccess: (data) => {
      utils.cart.getCart.invalidate();
      toast.success(data.action === "added" ? "เพิ่มลงตะกร้าแล้ว" : "อัปเดตตะกร้าแล้ว", {
        action: { label: "ดูตะกร้า", onClick: () => navigate("/cart") },
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const startConversation = trpc.chat.startConversation.useMutation({
    onSuccess: (data) => navigate(`/chat/${data.conversationId}`),
    onError: (err) => toast.error(err.message),
  });

  function handleStartChat(chatMode: "c2c" | "b2b") {
    startConversation.mutate({ productId, chatMode });
  }

  function supportsChatMode(mode: "c2c" | "b2b"): boolean {
    const lt = (product as any)?.listingType ?? "both";
    if (lt === "both") return true;
    return lt === mode;
  }

  const deleteProduct = trpc.products.delete.useMutation({
    onSuccess: () => { toast.success("ลบสินค้าเรียบร้อยแล้ว"); navigate("/seller/dashboard"); },
    onError: (err) => toast.error(err.message),
  });

  const markSoldExternal = trpc.products.markSoldExternal.useMutation({
    onSuccess: () => { toast.success("บันทึกว่าขายนอกระบบแล้ว"); navigate("/seller/dashboard"); },
    onError: (err) => toast.error(err.message),
  });

  const { data: product, isLoading } = trpc.products.getById.useQuery(
    { id: productId },
    { enabled: !!productId }
  );

  const { data: reviews } = trpc.reviews.getByProduct.useQuery(
    { productId },
    { enabled: !!productId }
  );

  const { data: sellerRating } = trpc.reviews.getSellerRating.useQuery(
    { sellerId: product?.sellerId ?? 0 },
    { enabled: !!product?.sellerId }
  );

  const { data: sellerStore } = trpc.sellerStore.getProfile.useQuery(
    { sellerId: product?.sellerId ?? 0 },
    { enabled: !!product?.sellerId }
  );

  const [selectedQty, setSelectedQty] = useState(1);

  // ── Like state ─────────────────────────────────────────────────────────
  const { data: likeData } = trpc.likes.getLikeStatus.useQuery(
    { productId },
    { enabled: !!productId, staleTime: 30_000 }
  );
  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const [optimisticLikeCount, setOptimisticLikeCount] = useState<number | null>(null);
  const liked = optimisticLiked ?? likeData?.liked ?? false;
  const likeCount = optimisticLikeCount ?? likeData?.likeCount ?? 0;

  const toggleLikeMutation = trpc.likes.toggleLike.useMutation({
    onMutate: () => {
      const prev = likeData?.liked ?? false;
      const prevCount = likeData?.likeCount ?? 0;
      setOptimisticLiked(!prev);
      setOptimisticLikeCount(prev ? Math.max(0, prevCount - 1) : prevCount + 1);
    },
    onSuccess: () => {
      setOptimisticLiked(null);
      setOptimisticLikeCount(null);
      utils.likes.getLikeStatus.invalidate({ productId });
    },
    onError: (err) => {
      setOptimisticLiked(null);
      setOptimisticLikeCount(null);
      toast.error(err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
    },
  });

  // ── Follow state ───────────────────────────────────────────────────────
  const { data: followData } = trpc.likes.getFollowStatus.useQuery(
    { sellerId: product?.sellerId ?? 0 },
    { enabled: !!product?.sellerId, staleTime: 30_000 }
  );
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
  const [optimisticFollowerCount, setOptimisticFollowerCount] = useState<number | null>(null);
  const following = optimisticFollowing ?? followData?.following ?? false;
  const followerCount = optimisticFollowerCount ?? followData?.followerCount ?? 0;

  const toggleFollowMutation = trpc.likes.toggleFollow.useMutation({
    onMutate: () => {
      const prev = followData?.following ?? false;
      const prevCount = followData?.followerCount ?? 0;
      setOptimisticFollowing(!prev);
      setOptimisticFollowerCount(prev ? Math.max(0, prevCount - 1) : prevCount + 1);
    },
    onSuccess: () => {
      setOptimisticFollowing(null);
      setOptimisticFollowerCount(null);
      utils.likes.getFollowStatus.invalidate({ sellerId: product?.sellerId ?? 0 });
    },
    onError: (err) => {
      setOptimisticFollowing(null);
      setOptimisticFollowerCount(null);
      toast.error(err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8 max-w-5xl">
          <Skeleton className="h-5 w-28 mb-8 rounded-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <Skeleton className="aspect-square rounded-2xl" />
            <div className="space-y-5">
              <Skeleton className="h-7 w-3/4 rounded-lg" />
              <Skeleton className="h-10 w-1/3 rounded-lg" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
          <h2 className="text-xl font-semibold mb-2 text-foreground">ไม่พบสินค้า</h2>
          <p className="text-muted-foreground text-sm mb-5">สินค้านี้อาจถูกลบหรือไม่มีอยู่แล้ว</p>
          <Link href="/products"><Button className="rounded-full px-6">ดูสินค้าทั้งหมด</Button></Link>
        </div>
      </div>
    );
  }

  const images = (product.images as string[]) ?? [];
  const seller = (product as any).seller;
  const isSold = product.status === "sold";
  const isExpired = product.status === "expired";
  const isHidden = product.status === "hidden";
  const isOwnProduct = user?.id === product.sellerId;
  const isActive = product.status === "active";

  // วันหมดอายุ
  const expiresAt = (product as any).expiresAt ? new Date((product as any).expiresAt) : null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const isNearExpiry = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;

  function handleShare() {
    navigator.clipboard.writeText(window.location.href);
    toast.success("คัดลอกลิงก์แล้ว");
  }

  function handleLike() {
    if (!user) { toast.info("กรุณาเข้าสู่ระบบก่อนกดถูกใจ"); return; }
    toggleLikeMutation.mutate({ productId });
  }

  function handleFollow() {
    if (!user) { toast.info("กรุณาเข้าสู่ระบบก่อนติดตามผู้ขาย"); return; }
    if (product) toggleFollowMutation.mutate({ sellerId: product.sellerId });
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`คัดลอก${label}แล้ว`);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-5xl">

        {/* Back navigation */}
        <Link href="/products"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          กลับไปหน้าสินค้า
        </Link>

        {/* Status banners */}
        {isSold && (
          <div className="mb-6 p-4 rounded-xl bg-purple-50 border border-purple-200 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-purple-500 shrink-0" />
            <p className="font-semibold text-purple-800">สินค้านี้ขายแล้ว ไม่สามารถสั่งซื้อได้</p>
          </div>
        )}
        {isExpired && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="font-semibold text-amber-800">ประกาศนี้หมดอายุแล้ว ไม่แสดงในหน้าค้นหา</p>
          </div>
        )}
        {isHidden && (
          <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-200 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-gray-400 shrink-0" />
            <p className="font-semibold text-gray-600">ประกาศนี้ถูกซ่อนอยู่ ไม่แสดงในหน้าค้นหา</p>
          </div>
        )}
        {isActive && isNearExpiry && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="font-semibold text-amber-800">ประกาศนี้จะหมดอายุใน {daysLeft} วัน ({expiresAt?.toLocaleDateString("th-TH")})</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

          {/* ── Image Gallery ── */}
          <div className="space-y-3">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted border border-border/60"
              style={{ boxShadow: "0 2px 12px oklch(0.18 0.02 55 / 0.08)" }}>
              {images.length > 0 ? (
                <img
                  src={images[currentImage]}
                  alt={product.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <Package className="w-16 h-16 opacity-10" />
                </div>
              )}

              {isSold && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-[1px]">
                  <span className="text-white text-2xl font-bold tracking-wide px-6 py-3 border-2 border-white/60 rounded-xl">
                    ขายแล้ว
                  </span>
                </div>
              )}

              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentImage((i) => Math.max(0, i - 1))}
                    disabled={currentImage === 0}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm text-foreground flex items-center justify-center hover:bg-white disabled:opacity-30 transition shadow-md"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentImage((i) => Math.min(images.length - 1, i + 1))}
                    disabled={currentImage === images.length - 1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm text-foreground flex items-center justify-center hover:bg-white disabled:opacity-30 transition shadow-md"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentImage(i)}
                        className={`rounded-full transition-all duration-150 ${i === currentImage ? "w-5 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/50 hover:bg-white/80"}`}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Image count badge */}
              {images.length > 1 && (
                <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                  {currentImage + 1}/{images.length}
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImage(i)}
                    className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden transition-all duration-150 ${
                      i === currentImage
                        ? "ring-2 ring-primary ring-offset-1 opacity-100"
                        : "opacity-60 hover:opacity-90"
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Video */}
            {(product as any).videoUrl && (
              <div className="rounded-xl overflow-hidden border border-border/60">
                <video
                  src={(product as any).videoUrl}
                  controls
                  className="w-full"
                  style={{ maxHeight: 280 }}
                />
              </div>
            )}
          </div>

          {/* ── Product Info ── */}
          <div className="space-y-5">

            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              {!isActive && !isSold && (
                <Badge variant="secondary" className="rounded-full">
                  {product.status === "pending_approval" ? "รออนุมัติ"
                    : product.status === "pending_fee" ? "รอชำระค่าธรรมเนียม"
                    : product.status === "rejected" ? "ถูกปฏิเสธ"
                    : product.status}
                </Badge>
              )}
              {isSold && <Badge variant="destructive" className="rounded-full">ขายแล้ว</Badge>}
              <Badge variant="outline" className="rounded-full text-xs">
                {CONDITION_LABELS[product.condition as keyof typeof CONDITION_LABELS] ?? product.condition}
              </Badge>
            </div>

            {/* Title + Price */}
            <div>
              <h1 className="text-2xl font-bold leading-snug text-foreground mb-3"
                style={{ fontFamily: "'Noto Serif Thai', serif" }}>
                {product.title}
              </h1>
              {/* Pricing block */}
              {(() => {
                const tiers: { minQty: number; pricePerUnit: number }[] = (product as any).priceTiers ?? [];
                const activeTier = [...tiers].reverse().find(t => selectedQty >= t.minQty);
                const effectivePrice = activeTier ? activeTier.pricePerUnit : parseFloat(product.price);
                const salePrice = (product as any).salePrice ? parseFloat((product as any).salePrice) : null;
                const originalPrice = (product as any).originalPrice ? parseFloat((product as any).originalPrice) : null;
                const retailPrice = (product as any).retailPrice ? parseFloat((product as any).retailPrice) : null;
                const conditionPercent = (product as any).conditionPercent;
                const displayPrice = salePrice ?? effectivePrice;
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <p className="text-3xl font-bold text-primary">{formatPrice(String(displayPrice * selectedQty))}</p>
                      {selectedQty > 1 && <span className="text-sm text-muted-foreground">({formatPrice(String(displayPrice))}/ชิ้น)</span>}
                      {(originalPrice || (salePrice && effectivePrice !== salePrice)) && (
                        <p className="text-base text-muted-foreground line-through">{formatPrice(String(originalPrice ?? effectivePrice))}</p>
                      )}
                      {salePrice && originalPrice && (
                        <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">
                          -{Math.round((1 - salePrice / originalPrice) * 100)}%
                        </span>
                      )}
                    </div>
                    {retailPrice && (
                      <p className="text-xs text-muted-foreground">
                        ราคามือหนึ่ง: <span className="line-through">{formatPrice(String(retailPrice))}</span>
                        {' '}<span className="text-green-600 font-medium">(ประหยัด {Math.round((1 - displayPrice / retailPrice) * 100)}%)</span>
                      </p>
                    )}
                    {conditionPercent !== null && conditionPercent !== undefined && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 max-w-[120px] h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-green-500" style={{ width: `${conditionPercent}%` }} />
                        </div>
                        <span className="text-xs font-medium text-foreground">สภาพ {conditionPercent}%</span>
                      </div>
                    )}
                    {/* Tier selector */}
                    {tiers.length > 0 && (
                      <div className="mt-3 p-3 rounded-xl border bg-muted/30 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">เลือกจำนวน (ยิ่งซื้อยิ่งถูก)</p>
                        <div className="flex flex-wrap gap-2">
                          {[1, ...tiers.map(t => t.minQty)].map((qty) => {
                            const t = [...tiers].reverse().find(t => qty >= t.minQty);
                            const p = t ? t.pricePerUnit : parseFloat(product.price);
                            return (
                              <button
                                key={qty}
                                type="button"
                                onClick={() => setSelectedQty(qty)}
                                className={`flex flex-col items-center px-3 py-2 rounded-xl border text-xs transition-all ${
                                  selectedQty === qty
                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                    : 'border-border hover:border-primary/50 hover:bg-muted/60'
                                }`}
                              >
                                <span className="font-bold">{qty} ชิ้น</span>
                                <span className="opacity-80">{formatPrice(String(p))}/ชิ้น</span>
                              </button>
                            );
                          })}
                        </div>
                        {activeTier && (
                          <p className="text-xs text-green-600 font-medium">✓ ราคาพิเศษ {formatPrice(String(activeTier.pricePerUnit))}/ชิ้น</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* Shipping fee & payment methods */}
              <div className="flex flex-wrap gap-2 mt-2">
                {parseFloat((product as any).shippingFee ?? "0") > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                    🚚 ค่าขนส่ง {formatPrice((product as any).shippingFee)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                    🚚 ฟรีค่าขนส่ง
                  </span>
                )}
                {(product as any).allowCod && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    COD เก็บเงินปลายทาง
                  </span>
                )}
                {(product as any).allowWallet && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Wallet ชำรบผ่านแอป
                  </span>
                )}
                {(product as any).deliveryDays && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                    ⏱ จัดส่งภายใน {(product as any).deliveryDays} วัน
                  </span>
                )}
                {(() => {
                  const qty = (product as any).quantity ?? 1;
                  if (qty <= 0) return <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">❌ สินค้าหมด</span>;
                  if (qty <= 3) return <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">⚠️ เหลือ {qty} ชิ้น</span>;
                  return <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground border border-border">คงเหลือ {qty} ชิ้น</span>;
                })()}
              </div>
            </div>

            {/* ── Owner Action Buttons ── */}
            {isOwnProduct && (product.status === "active" || product.status === "hidden" || product.status === "sold") && (
              <div className="p-3 rounded-xl border border-orange-200 bg-orange-50 space-y-2">
                <p className="text-xs font-semibold text-orange-700 mb-2">จัดการสินค้าของคุณ</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/sell?edit=${product.id}`}>
                    <Button variant="outline" size="sm" className="text-xs h-8 rounded-lg border-orange-300 text-orange-700 hover:bg-orange-100">
                      ✉️ แก้ไขสินค้า
                    </Button>
                  </Link>
                  {product.status === "active" && (
                    <Button
                      variant="outline" size="sm"
                      className="text-xs h-8 rounded-lg border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={() => { if (confirm("ยืนยันว่าสินค้านี้ขายไปนอกระบบแล้ว? ประกาศจะถูกปิดทันที")) markSoldExternal.mutate({ productId: product.id }); }}
                      disabled={markSoldExternal.isPending}
                    >
                      ✅ ขายนอกระบบ
                    </Button>
                  )}
                  <Button
                    variant="outline" size="sm"
                    className="text-xs h-8 rounded-lg border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => { if (confirm("ลบสินค้านี้ออกจากระบบ? ไม่สามารถกู้คืนได้")) deleteProduct.mutate({ id: product.id }); }}
                    disabled={deleteProduct.isPending}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />ลบสินค้า
                  </Button>
                </div>
              </div>
            )}

            {/* ── Primary Action Buttons (under price) ── */}
            {isActive && !isOwnProduct && (
              <div className="flex gap-2.5">
                {isAuthenticated ? (
                  <>
                    <Button
                      className="flex-1 gap-2 font-bold h-12 text-sm rounded-xl shadow-md"
                      style={{ background: (product as any).quantity <= 0 ? undefined : "oklch(0.65 0.18 50)", color: "white" }}
                      onClick={() => navigate(`/checkout/${product.id}?qty=${selectedQty}`)}
                      disabled={(product as any).quantity <= 0}
                    >
                      <Zap className="w-4 h-4" />
                      {(product as any).quantity <= 0 ? "สินค้าหมด" : "ซื้อเลย"}
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 h-12 px-4 text-sm rounded-xl"
                      onClick={() => addToCart.mutate({ productId: product.id, quantity: 1 })}
                      disabled={addToCart.isPending || (product as any).quantity <= 0}
                    >
                      <ShoppingCart className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 h-12 px-3 text-xs rounded-xl border-red-400 text-red-600 hover:bg-red-50"
                      onClick={() => handleStartChat("b2b")}
                      disabled={startConversation.isPending || !supportsChatMode("b2b")}
                      style={{ display: supportsChatMode("b2b") ? undefined : "none" }}
                    >
                      <MessageCircle className="w-4 h-4" />
                      B2B
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 h-12 px-3 text-xs rounded-xl border-blue-400 text-blue-600 hover:bg-blue-50"
                      onClick={() => handleStartChat("c2c")}
                      disabled={startConversation.isPending || !supportsChatMode("c2c")}
                      style={{ display: supportsChatMode("c2c") ? undefined : "none" }}
                    >
                      <MessageCircle className="w-4 h-4" />
                      C2C
                    </Button>
                  </>
                ) : (
                  <a href={getLoginUrl()} className="flex-1">
                    <Button className="w-full gap-2 h-12 text-sm rounded-xl">
                      <ShoppingCart className="w-4 h-4" /> เข้าสู่ระบบเพื่อสั่งซื้อ
                    </Button>
                  </a>
                )}
              </div>
            )}

            {/* Countdown timer */}
            {(product as any).expiresAt && isActive && (
              <div className="p-4 rounded-xl border border-border/60 bg-muted/30">
                <CountdownTimer
                  expiresAt={(product as any).expiresAt}
                  variant="full"
                />
              </div>
            )}

            {/* ── Like + Share row ── */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleLike}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-200 group/like"
                style={liked ? { borderColor: 'rgb(244 63 94 / 0.4)', background: 'rgb(255 241 242)' } : {}}
              >
                <Heart
                  className={`w-4 h-4 transition-all duration-200 ${
                    liked
                      ? 'fill-rose-500 stroke-rose-500 scale-110'
                      : 'stroke-muted-foreground group-hover/like:stroke-rose-400'
                  }`}
                />
                <span className={`text-sm font-medium transition-colors duration-200 ${
                  liked ? 'text-rose-500' : 'text-muted-foreground group-hover/like:text-rose-400'
                }`}>
                  {liked ? 'ถูกใจแล้ว' : 'ถูกใจ'}{likeCount > 0 ? ` (${likeCount})` : ''}
                </span>
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-all duration-200"
              >
                <Share2 className="w-4 h-4" />
                <span className="text-sm">แชร์</span>
              </button>
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground py-1">
              {product.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{product.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />มี {(product as any).quantity ?? 1} ชิ้น
              </span>
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />{product.viewCount ?? 0} ครั้ง
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />{formatDate(product.createdAt)}
              </span>
              {sellerStore && sellerStore.stats.soldCount > 0 && (
                <span className="flex items-center gap-1 text-green-600 font-medium">
                  <CheckCircle2 className="w-3 h-3" />ร้านนี้ขายไปแล้ว {sellerStore.stats.soldCount} ชิ้น
                </span>
              )}
            </div>

            {/* Description */}
            {product.description && (
              <div className="p-4 rounded-xl bg-muted/50 border border-border/40">
                <h3 className="font-semibold mb-2 text-sm text-foreground">รายละเอียดสินค้า</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{product.description}</p>
              </div>
            )}

            <Separator className="opacity-60" />

            {/* ── Seller Card ── */}
            {seller && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">ข้อมูลผู้ขาย</h3>
                <div className="rounded-xl border border-border/60 overflow-hidden"
                  style={{ boxShadow: "0 1px 6px oklch(0.18 0.02 55 / 0.06)" }}>

                  {/* Seller identity */}
                  <div className="flex items-center gap-3 p-4 bg-white">
                    <div className="w-11 h-11 rounded-full bg-accent overflow-hidden shrink-0 ring-2 ring-border/40">
                      {seller.avatar ? (
                        <img src={seller.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate text-foreground">{seller.name ?? "ผู้ขาย"}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {seller.kycStatus === "approved" && (
                          <span className="flex items-center gap-0.5 text-xs text-emerald-600 font-medium">
                            <CheckCircle2 className="w-3 h-3" /> ยืนยันตัวตนแล้ว
                          </span>
                        )}
                        {sellerRating && sellerRating.count > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {Number(sellerRating.avg).toFixed(1)} ({sellerRating.count} รีวิว)
                          </span>
                        )}
                      </div>
                    </div>
                    {isOwnProduct ? (
                      <Link href={`/sell?edit=${product.id}`}>
                        <Button variant="outline" size="sm" className="text-xs rounded-lg shrink-0">แก้ไขสินค้า</Button>
                      </Link>
                    ) : (
                      <button
                        onClick={handleFollow}
                        disabled={toggleFollowMutation.isPending}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 shrink-0 ${
                          following
                            ? 'bg-primary/10 text-primary border border-primary/30 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-300'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {following ? (
                          <><UserCheck className="w-3.5 h-3.5" /> ติดตามอยู่{followerCount > 0 ? ` (${followerCount})` : ''}</>
                        ) : (
                          <><UserPlus className="w-3.5 h-3.5" /> ติดตาม{followerCount > 0 ? ` (${followerCount})` : ''}</>
                        )}
                      </button>
                    )}
                  </div>

                  {/* View Store Link */}
                  <div className="px-4 pb-3">
                    <Link href={`/shop/${product.sellerId}`}>
                      <button className="w-full text-xs text-primary border border-primary/30 rounded-xl py-2 px-3 hover:bg-primary/5 transition-colors font-medium flex items-center justify-center gap-1.5">
                        <Store className="w-3.5 h-3.5" />
                        ดูร้านค้าทั้งหมด
                      </button>
                    </Link>
                  </div>
                  {/* Contact channels */}
                  {isActive && (
                    <div className="border-t border-border/40 bg-muted/30 p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        ช่องทางติดต่อผู้ขาย
                      </p>

                      {seller.phone && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-border/50 hover:border-border transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Phone className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <span className="text-sm font-medium flex-1 text-foreground">{seller.phone}</span>
                          <button
                            onClick={() => copyText(seller.phone, "เบอร์โทร")}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <a href={`tel:${seller.phone}`}
                            className="text-xs font-semibold text-primary hover:underline px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors">
                            โทร
                          </a>
                        </div>
                      )}

                      {seller.lineId && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[#06C755]/30 hover:border-[#06C755]/50 transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-[#06C755]/10 flex items-center justify-center shrink-0">
                            <MessageCircle className="w-3.5 h-3.5 text-[#06C755]" />
                          </div>
                          <span className="text-sm font-medium flex-1 text-foreground">LINE: {seller.lineId}</span>
                          <button
                            onClick={() => copyText(seller.lineId, "LINE ID")}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={`https://line.me/ti/p/~${seller.lineId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-[#06C755] hover:underline px-2 py-1 rounded-lg hover:bg-[#06C755]/5 transition-colors"
                          >
                            เพิ่มเพื่อน
                          </a>
                        </div>
                      )}

                      {seller.facebookUrl && (
                        <a
                          href={seller.facebookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-xl bg-white border border-[#1877F2]/30 hover:border-[#1877F2]/50 transition-colors group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                            <Facebook className="w-3.5 h-3.5 text-[#1877F2]" />
                          </div>
                          <span className="text-sm font-medium flex-1 text-[#1877F2]">Facebook</span>
                          <span className="text-xs font-semibold text-[#1877F2] group-hover:underline">เปิดโปรไฟล์ ↗</span>
                        </a>
                      )}

                      {(seller as any).email && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-border/50 hover:border-border transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="2" y="4" width="20" height="16" rx="2"/>
                              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                            </svg>
                          </div>
                          <span className="text-sm font-medium flex-1 truncate text-foreground">{(seller as any).email}</span>
                          <button
                            onClick={() => copyText((seller as any).email, "อีเมล")}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <a href={`mailto:${(seller as any).email}`}
                            className="text-xs font-semibold text-primary hover:underline px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors">
                            ส่งอีเมล
                          </a>
                        </div>
                      )}

                      {(seller as any).province && (
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-amber-200/60">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-amber-600 font-medium mb-0.5">ส่งจาก</p>
                            <p className="text-sm font-semibold text-foreground">{(seller as any).province}</p>
                            {(seller as any).address && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{(seller as any).address}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {!seller.phone && !seller.lineId && !seller.facebookUrl && !(seller as any).email && !(seller as any).province && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground italic py-1 text-center">ผู้ขายยังไม่ได้ระบุช่องทางติดต่อ</p>
                          {isOwnProduct && (
                            <Link href="/profile">
                              <button className="w-full text-xs text-primary border border-primary/30 rounded-xl py-2.5 px-3 hover:bg-primary/5 transition-colors font-medium">
                                เพิ่มช่องทางติดต่อในโปรไฟล์
                              </button>
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Chat Action Buttons (direct chat, no in-app payment) ── */}
            {isActive && !isOwnProduct && isAuthenticated && (
              <div className="flex flex-col gap-2">
                {supportsChatMode("b2b") && (
                  <Button
                    className={`w-full gap-2 h-11 text-sm rounded-xl text-white ${CHAT_MODE_COLORS.b2b} hover:bg-red-700`}
                    onClick={() => handleStartChat("b2b")}
                    disabled={startConversation.isPending}
                  >
                    <MessageCircle className="w-4 h-4" />
                    {startConversation.isPending ? "กำลังเปิด..." : CHAT_MODE_LABELS.b2b}
                  </Button>
                )}
                {supportsChatMode("c2c") && (
                  <Button
                    className={`w-full gap-2 h-11 text-sm rounded-xl text-white ${CHAT_MODE_COLORS.c2c} hover:bg-blue-700`}
                    onClick={() => handleStartChat("c2c")}
                    disabled={startConversation.isPending}
                  >
                    <MessageCircle className="w-4 h-4" />
                    {startConversation.isPending ? "กำลังเปิด..." : CHAT_MODE_LABELS.c2c}
                  </Button>
                )}
              </div>
            )}

            {/* Share button */}
            <Button variant="ghost" size="sm" onClick={handleShare}
              className="gap-2 w-full text-muted-foreground hover:text-foreground rounded-xl">
              <Share2 className="w-4 h-4" /> แชร์สินค้านี้
            </Button>
          </div>
        </div>

        {/* ── Reviews ── */}
        {reviews && reviews.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-5 text-foreground" style={{ fontFamily: "'Noto Serif Thai', serif" }}>
              รีวิวผู้ขาย ({reviews.length})
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {reviews.map((review: any) => (
                <div key={review.id}
                  className="p-4 rounded-xl border border-border/60 bg-white"
                  style={{ boxShadow: "0 1px 4px oklch(0.18 0.02 55 / 0.05)" }}>
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">{review.reviewer?.name ?? "ผู้ใช้"}</span>
                    <div className="flex items-center gap-0.5 ml-auto">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${i < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`}
                        />
                      ))}
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{review.comment}</p>
                  )}
                  <p className="text-xs text-muted-foreground/60 mt-2">{formatDate(review.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
