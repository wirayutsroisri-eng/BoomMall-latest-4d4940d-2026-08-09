import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatPrice } from "@shared/types";
import {
  ArrowLeft,
  Copy,
  MessageCircle,
  Minus,
  Package,
  Phone,
  Plus,
  ShoppingCart,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

const CONDITION_LABELS: Record<string, string> = {
  new: "ใหม่",
  like_new: "เหมือนใหม่",
  good: "ดี",
  fair: "พอใช้",
  poor: "ต้องซ่อม",
};

export default function CartPage() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: cart, isLoading } = trpc.cart.getCart.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const updateItem = trpc.cart.updateItem.useMutation({
    onSuccess: () => utils.cart.getCart.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const removeItem = trpc.cart.removeItem.useMutation({
    onSuccess: () => {
      utils.cart.getCart.invalidate();
      toast.success("ลบสินค้าออกจากตะกร้าแล้ว");
    },
    onError: (err) => toast.error(err.message),
  });

  const clearCart = trpc.cart.clearCart.useMutation({
    onSuccess: () => {
      utils.cart.getCart.invalidate();
      toast.success("ล้างตะกร้าแล้ว");
    },
    onError: (err) => toast.error(err.message),
  });

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`คัดลอก${label}แล้ว`);
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground/30" />
          <h2 className="text-xl font-semibold">กรุณาเข้าสู่ระบบ</h2>
          <p className="text-muted-foreground">เข้าสู่ระบบเพื่อดูตะกร้าสินค้าของคุณ</p>
          <a href={getLoginUrl()}>
            <Button>เข้าสู่ระบบ</Button>
          </a>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8 max-w-4xl">
          <Skeleton className="h-8 w-40 mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const items = cart?.items ?? [];
  const availableItems = items.filter((i) => i.product?.isAvailable);
  const unavailableItems = items.filter((i) => !i.product?.isAvailable);

  // จัดกลุ่มสินค้าตามผู้ขาย
  const sellerGroups: Record<
    number,
    { seller: NonNullable<typeof items[0]["product"]>["seller"]; items: typeof items }
  > = {};
  for (const item of availableItems) {
    if (!item.product) continue;
    const sellerId = item.product.sellerId;
    if (!sellerGroups[sellerId]) {
      sellerGroups[sellerId] = { seller: item.product.seller, items: [] };
    }
    sellerGroups[sellerId].items.push(item);
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8 max-w-4xl">
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> กลับไปหน้าสินค้า
          </Link>
          <div className="text-center py-24 space-y-4">
            <ShoppingCart className="w-20 h-20 mx-auto text-muted-foreground/20" />
            <h2 className="text-2xl font-bold">ตะกร้าของคุณว่างเปล่า</h2>
            <p className="text-muted-foreground">เริ่มเลือกสินค้าที่คุณสนใจได้เลย</p>
            <Link href="/products">
              <Button size="lg" className="mt-2">
                เลือกซื้อสินค้า
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="w-6 h-6" />
              ตะกร้าสินค้า
              <Badge variant="secondary">{cart?.itemCount ?? 0} ชิ้น</Badge>
            </h1>
          </div>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive text-xs"
              onClick={() => clearCart.mutate()}
              disabled={clearCart.isPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              ล้างตะกร้า
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── รายการสินค้า ── */}
          <div className="lg:col-span-2 space-y-4">
            {/* สินค้าที่พร้อมขาย — จัดกลุ่มตามผู้ขาย */}
            {Object.entries(sellerGroups).map(([sellerId, group]) => (
              <Card key={sellerId} className="overflow-hidden">
                {/* Seller header */}
                <div className="px-4 py-3 bg-muted/40 border-b flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="font-medium text-sm">{group.seller?.name ?? "ผู้ขาย"}</span>
                  {group.seller?.kycStatus === "approved" && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-200 py-0">
                      ยืนยันแล้ว
                    </Badge>
                  )}
                </div>

                <CardContent className="p-0 divide-y">
                  {group.items.map((item) => {
                    if (!item.product) return null;
                    const images = item.product.images ?? [];
                    return (
                      <div key={item.id} className="p-4 flex gap-4">
                        {/* รูปสินค้า */}
                        <Link href={`/products/${item.productId}`} className="shrink-0">
                          <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted border">
                            {images[0] ? (
                              <img
                                src={images[0]}
                                alt={item.product.title}
                                className="w-full h-full object-cover hover:scale-105 transition-transform"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-6 h-6 text-muted-foreground/30" />
                              </div>
                            )}
                          </div>
                        </Link>

                        {/* ข้อมูลสินค้า */}
                        <div className="flex-1 min-w-0">
                          <Link href={`/products/${item.productId}`}>
                            <p className="font-medium text-sm hover:text-primary transition-colors line-clamp-2">
                              {item.product.title}
                            </p>
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {CONDITION_LABELS[item.product.condition] ?? item.product.condition}
                            {item.product.location && ` · ${item.product.location}`}
                          </p>
                          <p className="text-primary font-bold mt-1">
                            {formatPrice(parseFloat(item.product.price))}
                          </p>

                          {/* ปรับจำนวน */}
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => {
                                if (item.quantity <= 1) {
                                  removeItem.mutate({ cartItemId: item.id });
                                } else {
                                  updateItem.mutate({ cartItemId: item.id, quantity: item.quantity - 1 });
                                }
                              }}
                              disabled={updateItem.isPending || removeItem.isPending}
                              className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-muted transition disabled:opacity-40"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <button
                              onClick={() =>
                                updateItem.mutate({ cartItemId: item.id, quantity: item.quantity + 1 })
                              }
                              disabled={
                                updateItem.isPending ||
                                item.quantity >= (item.product.quantity ?? 99)
                              }
                              className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-muted transition disabled:opacity-40"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <span className="text-xs text-muted-foreground ml-1">
                              (มี {item.product.quantity} ชิ้น)
                            </span>
                          </div>
                        </div>

                        {/* ราคารวม + ลบ */}
                        <div className="flex flex-col items-end justify-between shrink-0">
                          <button
                            onClick={() => removeItem.mutate({ cartItemId: item.id })}
                            disabled={removeItem.isPending}
                            className="text-muted-foreground hover:text-destructive transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <p className="font-bold text-sm">
                            {formatPrice(parseFloat(item.product.price) * item.quantity)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>

                {/* ช่องทางติดต่อผู้ขาย */}
                {group.seller && (
                  <div className="px-4 py-3 bg-muted/20 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-2">ติดต่อผู้ขายเพื่อนัดรับสินค้า</p>
                    <div className="flex flex-wrap gap-2">
                      {group.seller.phone && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border text-sm">
                          <Phone className="w-3.5 h-3.5 text-primary" />
                          <span className="font-medium">{group.seller.phone}</span>
                          <button
                            onClick={() => copyText(group.seller!.phone!, "เบอร์โทร")}
                            className="text-muted-foreground hover:text-foreground ml-1"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <a
                            href={`tel:${group.seller.phone}`}
                            className="text-primary text-xs font-medium hover:underline ml-1"
                          >
                            โทร
                          </a>
                        </div>
                      )}
                      {group.seller.lineId && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#06C755]/10 border border-[#06C755]/20 text-sm">
                          <MessageCircle className="w-3.5 h-3.5 text-[#06C755]" />
                          <span className="font-medium">LINE: {group.seller.lineId}</span>
                          <button
                            onClick={() => copyText(group.seller!.lineId!, "LINE ID")}
                            className="text-muted-foreground hover:text-foreground ml-1"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <a
                            href={`https://line.me/ti/p/~${group.seller.lineId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#06C755] text-xs font-medium hover:underline ml-1"
                          >
                            เพิ่มเพื่อน
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))}

            {/* สินค้าที่ไม่พร้อมขาย */}
            {unavailableItems.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  สินค้าที่ไม่พร้อมขาย ({unavailableItems.length} รายการ)
                </p>
                <Card className="overflow-hidden opacity-60">
                  <CardContent className="p-0 divide-y">
                    {unavailableItems.map((item) => {
                      const images = (item.product?.images ?? []) as string[];
                      return (
                        <div key={item.id} className="p-4 flex gap-4 items-center">
                          <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted border shrink-0">
                            {images[0] ? (
                              <img src={images[0]} alt="" className="w-full h-full object-cover grayscale" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-5 h-5 text-muted-foreground/30" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm line-clamp-1">
                              {item.product?.title ?? "สินค้าที่ถูกลบ"}
                            </p>
                            <Badge variant="secondary" className="text-xs mt-1">
                              ไม่พร้อมขาย
                            </Badge>
                          </div>
                          <button
                            onClick={() => removeItem.mutate({ cartItemId: item.id })}
                            className="text-muted-foreground hover:text-destructive transition shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* ── สรุปคำสั่งซื้อ ── */}
          <div className="space-y-4">
            <Card className="sticky top-4">
              <CardContent className="p-5 space-y-4">
                <h3 className="font-bold text-base">สรุปรายการ</h3>
                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>สินค้า {availableItems.length} รายการ</span>
                    <span>{cart?.itemCount ?? 0} ชิ้น</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>ยอดรวม</span>
                    <span className="text-primary">{formatPrice(cart?.total ?? 0)}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  <p className="font-medium">วิธีการซื้อสินค้า</p>
                  <p>ติดต่อผู้ขายโดยตรงผ่านเบอร์โทรหรือ LINE เพื่อนัดรับสินค้าและชำระเงิน</p>
                </div>

                <Link href="/products">
                  <Button variant="outline" className="w-full">
                    เลือกสินค้าเพิ่ม
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
