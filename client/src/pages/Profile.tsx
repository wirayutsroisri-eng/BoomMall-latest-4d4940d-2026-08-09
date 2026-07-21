import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  User, ShieldCheck, Camera, Settings, LogOut,
  Package, Star, RotateCcw, Truck, CreditCard, MapPinned, Bell, BellOff,
  HelpCircle, ChevronRight, Store, Tag, ShoppingBag, Heart, Wallet
} from "lucide-react";
import { useRef } from "react";
import { usePushNotification } from "@/hooks/usePushNotification";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useImageEditorModal } from "@/components/ImageEditorModal";
import { toast } from "sonner";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { prepareImageForUpload, ImageUploadError } from "@/lib/imageUpload";

export default function ProfilePage() {
  const { user, isAuthenticated, refresh } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isSubscribed, isLoading: pushLoading, subscribe, unsubscribe, isSupported: pushSupported } = usePushNotification();
  const { openImageEditor, imageEditorModal } = useImageEditorModal();

  const { data: myProducts } = trpc.products.getMySelling.useQuery(
    { limit: 1 },
    { enabled: isAuthenticated }
  );
  const { data: likedProducts } = trpc.likes.getLikedProducts.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: myPurchases } = trpc.orders.myPurchases.useQuery(
    { status: "all", limit: 1, offset: 0 },
    { enabled: isAuthenticated }
  );

  const uploadAvatar = trpc.kyc.uploadAvatar.useMutation({
    onSuccess: () => { toast.success("เปลี่ยนรูปโปรไฟล์สำเร็จ"); refresh(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const editedFile = await openImageEditor(file, {
        title: "แต่งรูปโปรไฟล์",
        description: "ครอปและหมุนรูปโปรไฟล์ก่อนอัปโหลด",
        aspectOptions: ["1:1"],
        initialAspect: "1:1",
      });
      if (!editedFile) return;

      const prepared = await prepareImageForUpload(editedFile);
      uploadAvatar.mutate({
        base64: prepared.dataUrl,
        mimeType: prepared.contentType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      });
    } catch (err) {
      toast.error(err instanceof ImageUploadError ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    }
  };

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 pb-20">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
          <User className="w-10 h-10 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">เข้าสู่ระบบเพื่อดูโปรไฟล์ของคุณ</p>
        <a href={getLoginUrl()}><Button className="rounded-full px-8 bg-orange-600 hover:bg-orange-700">เข้าสู่ระบบ</Button></a>
      </div>
    );
  }

  const kycStatus = (user as any)?.kycStatus ?? "unverified";
  const isVerified = kycStatus === "approved";
  const productCount = myProducts?.total ?? 0;
  const likeCount = likedProducts?.length ?? 0;
  const purchaseCount = (myPurchases as any)?.total ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ── Header Profile ── */}
      <div className="bg-gradient-to-br from-orange-500 via-orange-400 to-amber-400 pt-6 pb-8 px-4">
        <div className="container">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative">
                <Avatar className="w-16 h-16 border-3 border-white/80 shadow-lg">
                  <AvatarImage src={user?.avatar ?? undefined} />
                  <AvatarFallback className="bg-white text-orange-600 text-lg font-bold">
                    {user?.name?.[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow text-orange-600"
                >
                  <Camera className="w-3 h-3" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarChange} />
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-base text-white truncate">{user?.name ?? "ผู้ใช้"}</h2>
                <p className="text-xs text-white/70">ID: {String(user?.id).slice(0, 8)}...</p>
                <div className="flex items-center gap-1 mt-1">
                  {isVerified && (
                    <Badge className="bg-white/20 text-white border-0 text-[10px] px-1.5 py-0 gap-0.5 backdrop-blur-sm">
                      <ShieldCheck className="w-2.5 h-2.5" /> ยืนยันแล้ว
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Link href="/kyc">
              <button className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <Settings className="w-5 h-5 text-white" />
              </button>
            </Link>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 mt-5 bg-white/15 backdrop-blur-sm rounded-xl p-3">
            <Link href="/seller/dashboard">
              <div className="text-center cursor-pointer">
                <div className="text-lg font-bold text-white">{productCount}</div>
                <div className="text-[11px] text-white/80">สินค้าของฉัน</div>
              </div>
            </Link>
            <Link href="/my-orders">
              <div className="text-center cursor-pointer">
                <div className="text-lg font-bold text-white">{purchaseCount}</div>
                <div className="text-[11px] text-white/80">คำสั่งซื้อ</div>
              </div>
            </Link>
            <div className="text-center">
              <div className="text-lg font-bold text-white">{likeCount}</div>
              <div className="text-[11px] text-white/80">ที่ถูกใจ</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          ฝั่งซื้อ (Buyer) — สีน้ำเงิน/Indigo
      ═══════════════════════════════════════════════════════════════ */}
      <section className="mx-3 -mt-3 bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
          <ShoppingBag className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-blue-900">การซื้อของฉัน</h3>
          <Link href="/my-orders" className="ml-auto">
            <span className="text-xs text-blue-600 font-medium flex items-center gap-0.5">
              ดูทั้งหมด <ChevronRight className="w-3 h-3" />
            </span>
          </Link>
        </div>

        {/* Order status shortcuts */}
        <div className="grid grid-cols-5 gap-1 px-3 py-3">
          <Link href="/my-orders?status=pending_payment">
            <div className="flex flex-col items-center gap-1.5 py-1 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer">
              <div className="w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 relative">
                <CreditCard className="w-4 h-4" />
                {(myPurchases?.counts?.pending_payment ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{myPurchases!.counts!.pending_payment}</span>
                )}
              </div>
              <span className="text-[10px] text-center text-gray-600">รอชำระ</span>
            </div>
          </Link>

          <Link href="/my-orders?status=payment_confirmed">
            <div className="flex flex-col items-center gap-1.5 py-1 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer">
              <div className="w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 relative">
                <Truck className="w-4 h-4" />
                {(myPurchases?.counts?.payment_confirmed ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{myPurchases!.counts!.payment_confirmed}</span>
                )}
              </div>
              <span className="text-[10px] text-center text-gray-600">รอส่ง</span>
            </div>
          </Link>

          <Link href="/my-orders?status=shipped">
            <div className="flex flex-col items-center gap-1.5 py-1 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer">
              <div className="w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 relative">
                <Package className="w-4 h-4" />
                {(myPurchases?.counts?.shipped ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{myPurchases!.counts!.shipped}</span>
                )}
              </div>
              <span className="text-[10px] text-center text-gray-600">รอรับ</span>
            </div>
          </Link>

          <Link href="/my-orders?status=completed">
            <div className="flex flex-col items-center gap-1.5 py-1 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer">
              <div className="w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 relative">
                <Star className="w-4 h-4" />
                {(myPurchases?.counts?.completed ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{myPurchases!.counts!.completed}</span>
                )}
              </div>
              <span className="text-[10px] text-center text-gray-600">รีวิว</span>
            </div>
          </Link>

          <Link href="/my-orders?status=cancelled">
            <div className="flex flex-col items-center gap-1.5 py-1 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer">
              <div className="w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                <RotateCcw className="w-4 h-4" />
              </div>
              <span className="text-[10px] text-center text-gray-600">คืนเงิน</span>
            </div>
          </Link>
        </div>

        {/* Buyer quick links */}
        <div className="border-t border-blue-50 px-4 py-2">
          <Link href="/kyc">
            <button className="w-full flex items-center gap-3 py-2.5 hover:bg-blue-50 rounded-lg transition-colors text-left">
              <MapPinned className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-gray-700">ที่อยู่รับสินค้า</span>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
            </button>
          </Link>
          <Link href="/products">
            <button className="w-full flex items-center gap-3 py-2.5 hover:bg-blue-50 rounded-lg transition-colors text-left">
              <Heart className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-gray-700">สินค้าที่ถูกใจ</span>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
            </button>
          </Link>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          ฝั่งขาย (Seller) — สีส้ม/Amber
      ═══════════════════════════════════════════════════════════════ */}
      <section className="mx-3 mt-3 bg-white rounded-xl shadow-sm border border-orange-100 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
          <Store className="w-4 h-4 text-orange-600" />
          <h3 className="font-bold text-sm text-orange-900">ร้านค้าของฉัน</h3>
          <Link href="/seller/dashboard" className="ml-auto">
            <span className="text-xs text-orange-600 font-medium flex items-center gap-0.5">
              จัดการร้าน <ChevronRight className="w-3 h-3" />
            </span>
          </Link>
        </div>

        {/* Seller quick actions */}
        <div className="grid grid-cols-3 gap-2 px-4 py-3">
          <Link href="/sell">
            <div className="flex flex-col items-center gap-1.5 py-2 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer">
              <div className="w-9 h-9 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-sm">
                <Tag className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-medium text-orange-800">ลงขาย</span>
            </div>
          </Link>

          <Link href="/seller/orders">
            <div className="flex flex-col items-center gap-1.5 py-2 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer">
              <div className="w-9 h-9 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-sm">
                <Package className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-medium text-orange-800">คำสั่งขาย</span>
            </div>
          </Link>

          <Link href={`/shop/${user?.id}`}>
            <div className="flex flex-col items-center gap-1.5 py-2 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer">
              <div className="w-9 h-9 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-sm">
                <Store className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-medium text-orange-800">หน้าร้าน</span>
            </div>
          </Link>
        </div>

        {/* Seller settings links */}
        <div className="border-t border-orange-50 px-4 py-2">
          <Link href="/payment-settings">
            <button className="w-full flex items-center gap-3 py-2.5 hover:bg-orange-50 rounded-lg transition-colors text-left">
              <Wallet className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-gray-700">บัญชีรับเงิน</span>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
            </button>
          </Link>
          <Link href="/seller/dashboard">
            <button className="w-full flex items-center gap-3 py-2.5 hover:bg-orange-50 rounded-lg transition-colors text-left">
              <Package className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-gray-700">สินค้าทั้งหมด ({productCount})</span>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
            </button>
          </Link>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          ตั้งค่าทั่วไป — สีเทา
      ═══════════════════════════════════════════════════════════════ */}
      <section className="mx-3 mt-3 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-2">
          {/* Push Notification */}
          <button
            onClick={() => {
              if (!pushSupported) {
                toast.info("บราวเซอร์ของคุณไม่รองรับการแจ้งเตือน");
                return;
              }
              isSubscribed ? unsubscribe() : subscribe();
            }}
            disabled={pushLoading}
            className="w-full flex items-center gap-3 py-2.5 hover:bg-gray-50 rounded-lg transition-colors text-left"
          >
            {isSubscribed ? (
              <Bell className="w-4 h-4 text-green-600" />
            ) : (
              <BellOff className="w-4 h-4 text-gray-400" />
            )}
            <div className="flex-1">
              <span className="text-sm text-gray-700">การแจ้งเตือน</span>
            </div>
            {isSubscribed ? (
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">เปิดอยู่</span>
            ) : (
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">ปิดอยู่</span>
            )}
          </button>

          {/* Help Center */}
          <Link href="/help">
            <button className="w-full flex items-center gap-3 py-2.5 hover:bg-gray-50 rounded-lg transition-colors text-left">
              <HelpCircle className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700">ศูนย์ช่วยเหลือ</span>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
            </button>
          </Link>

          {/* Logout */}
          <button
            onClick={() => logout.mutate()}
            className="w-full flex items-center gap-3 py-2.5 hover:bg-red-50 rounded-lg transition-colors text-left"
          >
            <LogOut className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-600 font-medium">ออกจากระบบ</span>
          </button>
        </div>
      </section>

      <div className="h-4" />
      {imageEditorModal}
    </div>
  );
}
