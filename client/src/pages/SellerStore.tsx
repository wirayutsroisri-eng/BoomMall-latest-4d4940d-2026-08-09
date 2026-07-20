import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Star,
  Package,
  Users,
  ShoppingBag,
  MessageCircle,
  ChevronRight,
  Search,
  MapPin,
  CheckCircle,
  Store,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function formatNumber(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}

function formatPrice(price: string | number): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("th-TH").format(num);
}

export default function SellerStore() {
  const { userId } = useParams<{ userId: string }>();
  const sellerId = parseInt(userId ?? "0", 10);
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const { data, isLoading, error, refetch } = trpc.sellerStore.getProfile.useQuery(
    { sellerId },
    { enabled: sellerId > 0 }
  );

  const toggleFollow = trpc.likes.toggleFollow.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Fix #1: conv.conversationId (not conv.id)
  const startChat = trpc.chat.startConversation.useMutation({
    onSuccess: (conv) => {
      window.location.href = `/chat/${conv.conversationId}`;
    },
    onError: () => {
      toast.error("ไม่สามารถเริ่มแชทได้");
    },
  });

  const filteredProducts = useMemo(() => {
    if (!data?.allProducts) return [];
    let list = data.allProducts;
    if (search.trim()) {
      list = list.filter((p) =>
        p.title.toLowerCase().includes(search.toLowerCase())
      );
    }
    return list;
  }, [data?.allProducts, search]);

  if (!sellerId || isNaN(sellerId)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">ไม่พบร้านค้านี้</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-40 bg-muted" />
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-end gap-4 -mt-10 mb-6">
            <Skeleton className="w-20 h-20 rounded-full" />
            <div className="flex-1 pb-2">
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <Store className="w-16 h-16 text-muted-foreground" />
        <p className="text-muted-foreground text-lg">ไม่พบร้านค้านี้</p>
        <Link href="/products">
          <Button variant="outline">ดูสินค้าทั้งหมด</Button>
        </Link>
      </div>
    );
  }

  const { seller, stats, isFollowing, bestSellers, allProducts } = data;
  const isOwner = user?.id === seller.id;

  const coverGradients = [
    "from-orange-400 to-amber-500",
    "from-rose-400 to-pink-500",
    "from-violet-400 to-purple-500",
    "from-sky-400 to-blue-500",
    "from-emerald-400 to-teal-500",
  ];
  const coverGradient = coverGradients[seller.id % coverGradients.length];

  return (
    <div className="min-h-screen bg-background">
      {/* Cover Banner */}
      <div className={`h-44 bg-gradient-to-r ${coverGradient} relative`}>
        <div className="absolute inset-0 bg-black/10" />
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.3) 10px, rgba(255,255,255,0.3) 20px)",
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4">
        {/* Seller Header Card */}
        <div className="bg-card border border-border rounded-2xl shadow-sm -mt-12 mb-4 p-4 relative z-10">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Avatar + Info */}
            <div className="flex items-start gap-4">
              {/* Fix #2: seller.avatar ?? undefined (null → undefined) */}
              <Avatar className="w-20 h-20 border-4 border-background shadow-lg -mt-8 ring-2 ring-primary/20">
                <AvatarImage
                  src={seller.avatar ?? undefined}
                  alt={seller.name ?? undefined}
                />
                <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                  {seller.name?.[0]?.toUpperCase() ?? "S"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-foreground truncate">{seller.name}</h1>
                  {seller.kycStatus === "approved" && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs gap-1">
                      <CheckCircle className="w-3 h-3" />
                      ยืนยันแล้ว
                    </Badge>
                  )}
                </div>
                {seller.province && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{seller.province}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 mt-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  <span className="text-xs text-muted-foreground">ออนไลน์</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
              {isOwner ? (
                <Link href="/seller/dashboard">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Store className="w-4 h-4" />
                    จัดการร้านค้า
                  </Button>
                </Link>
              ) : (
                <>
                  <Button
                    variant={isFollowing ? "outline" : "default"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      if (!user) {
                        toast.error("กรุณาเข้าสู่ระบบก่อน");
                        return;
                      }
                      toggleFollow.mutate({ sellerId: seller.id });
                    }}
                    disabled={toggleFollow.isPending}
                  >
                    <Users className="w-4 h-4" />
                    {isFollowing ? "กำลังติดตาม" : "ติดตาม"}
                  </Button>
                  {/* Fix #3: startConversation only accepts { productId }, remove sellerId/origin */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      if (!user) {
                        toast.error("กรุณาเข้าสู่ระบบก่อน");
                        return;
                      }
                      const firstProduct = allProducts[0];
                      if (!firstProduct) {
                        toast.error("ร้านนี้ยังไม่มีสินค้า");
                        return;
                      }
                      startChat.mutate({ productId: firstProduct.id });
                    }}
                    disabled={startChat.isPending}
                  >
                    <MessageCircle className="w-4 h-4" />
                    แชท
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-border">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="font-bold text-foreground">
                  {stats.rating > 0 ? stats.rating.toFixed(1) : "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">คะแนน</p>
            </div>
            <div className="text-center">
              <div className="font-bold text-foreground">{formatNumber(stats.totalProducts)}</div>
              <p className="text-xs text-muted-foreground mt-0.5">สินค้า</p>
            </div>
            <div className="text-center">
              <div className="font-bold text-foreground">{formatNumber(stats.soldCount)}</div>
              <p className="text-xs text-muted-foreground mt-0.5">ขายแล้ว</p>
            </div>
            <div className="text-center">
              <div className="font-bold text-foreground">{formatNumber(stats.followerCount)}</div>
              <p className="text-xs text-muted-foreground mt-0.5">ผู้ติดตาม</p>
            </div>
          </div>
        </div>

        {/* Best Sellers Section */}
        {bestSellers.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-foreground flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                สินค้าขายดีประจำร้าน
              </h2>
              <a
                href="#all-products"
                className="text-sm text-primary flex items-center gap-0.5 hover:underline"
              >
                ดูทั้งหมด <ChevronRight className="w-4 h-4" />
              </a>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {bestSellers.map((product) => (
                <Link
                  key={product.id}
                  href={`/products/${product.id}`}
                  className="flex-shrink-0 w-40 block"
                >
                  <div className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                    <div className="aspect-square bg-muted overflow-hidden">
                      {(product.images as string[])?.[0] ? (
                        <img
                          src={(product.images as string[])[0]}
                          alt={product.title}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs text-foreground font-medium line-clamp-2 leading-tight mb-1">
                        {product.title}
                      </p>
                      <p className="text-sm font-bold text-primary">
                        ฿{formatPrice(product.price)}
                      </p>
                      {stats.reviewCount > 0 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span className="text-xs text-muted-foreground">
                            {stats.rating.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* All Products Section */}
        <div id="all-products" className="mb-8">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              สินค้าทั้งหมดในร้าน
              <Badge variant="secondary" className="text-xs">
                {stats.totalProducts}
              </Badge>
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาในร้านนี้..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {search ? `ไม่พบสินค้าที่ตรงกับ "${search}"` : "ยังไม่มีสินค้าในร้านนี้"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
