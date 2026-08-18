import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { isDevBypassEnabled } from "@/devBypass";
import {
  Home,
  Search,
  Camera,
  MessageCircle,
  User,
  ShieldCheck,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useCallback } from "react";
import { toast } from "sonner";
import { prepareImageForUpload, ImageUploadError } from "@/lib/imageUpload";
import { ImageSourcePicker } from "@/components/ImageSourceSheet";

export default function BottomNav() {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";
  const [location] = useLocation();

  const searchByImageMutation = trpc.products.searchByImage.useMutation({
    onSuccess: (result) => {
      // navigate ไป /products พร้อม query string ที่ AI สร้าง
      const q = encodeURIComponent(result.searchQuery);
      // เก็บ analysis ไว้ใน sessionStorage เพื่อให้ Products page อ่านได้
      sessionStorage.setItem("imageSearchResult", JSON.stringify(result));
      window.location.href = `/products?q=${q}&imageSearch=1`;
    },
    onError: (err) => {
      toast.error("ไม่สามารถวิเคราะห์รูปภาพได้", { description: err.message });
    },
  });

  const handleImageSelect = useCallback(async (file: File) => {
    toast.loading("AI กำลังวิเคราะห์รูปภาพ...", { id: "image-search-toast" });
    try {
      const prepared = await prepareImageForUpload(file);
      sessionStorage.setItem("imageSearchPreview", prepared.dataUrl);
      searchByImageMutation.mutate({
        imageData: prepared.base64,
        mimeType: prepared.contentType,
        limit: 24,
      });
    } catch (err) {
      toast.dismiss("image-search-toast");
      toast.error(err instanceof ImageUploadError ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    }
  }, [searchByImageMutation]);

  const handleFiles = useCallback((files: File[]) => {
    const file = files[0];
    if (file) void handleImageSelect(file);
  }, [handleImageSelect]);

  const { data: unreadData } = trpc.chat.getUnreadCount.useQuery(undefined, {
    enabled: isAuthenticated && !isDevBypassEnabled(),
    refetchInterval: 15000,
  });
  const unreadCount = unreadData?.count ?? 0;

  // ซ่อน BottomNav เมื่ออยู่ในหน้าแชทสนทนา (/chat/:id)
  if (/^\/chat\/\d+/.test(location)) return null;

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  const isSearchLoading = searchByImageMutation.isPending;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-card border-t border-border/60 safe-area-bottom shadow-lg shadow-black/5"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex items-center justify-around h-[70px] max-w-lg mx-auto px-1">

        {/* Tab 1: หน้าหลัก */}
        <TabItem
          path="/"
          icon={Home}
          label="หน้าแรก"
          active={isActive("/")}
        />

        {/* Tab 2: สินค้า */}
        <TabItem
          path="/products"
          icon={Search}
          label="ค้นหา"
          active={isActive("/products")}
        />

        {/* Center: ปุ่มกล้อง — เลือกถ่ายรูปหรือคลังรูป */}
        <ImageSourcePicker
          onFiles={handleFiles}
          disabled={isSearchLoading}
          title="ค้นหาด้วยรูป"
          description="ถ่ายสินค้าแล้วให้ AI หาของใกล้เคียง"
        >
          {(openPicker) => (
            <div className="flex flex-col items-center justify-center -mt-8">
              <button
                type="button"
                onClick={openPicker}
                disabled={isSearchLoading}
                className="relative w-16 h-16 rounded-full bg-orange-600 hover:bg-orange-700 flex items-center justify-center shadow-lg shadow-orange-600/40 active:scale-95 transition-all duration-150 disabled:opacity-70"
                aria-label="ค้นหาด้วยรูปภาพ AI"
              >
                {isSearchLoading ? (
                  <div className="w-7 h-7 border-3 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Camera className="w-8 h-8 text-white stroke-[1.5]" />
                )}
                {!isSearchLoading && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-md">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                    </svg>
                  </span>
                )}
              </button>
              <span className="text-[11px] font-bold text-orange-600 mt-1">
                {isSearchLoading ? "วิเคราะห์..." : "สแกน"}
              </span>
            </div>
          )}
        </ImageSourcePicker>

        {/* Tab 3: แชท */}
        <TabItem
          path="/chats"
          icon={MessageCircle}
          label="แชท"
          active={isActive("/chats") || isActive("/chat/")}
          badge={unreadCount}
          requireAuth={true}
          isAuthenticated={isAuthenticated}
        />

        {/* Tab 4: ของฉัน */}
        <TabItem
          path="/profile"
          icon={User}
          label="ฉัน"
          active={isActive("/profile") || isActive("/my-orders") || isActive("/seller")}
          requireAuth={true}
          isAuthenticated={isAuthenticated}
        />
      </div>
      {/* Admin shortcut — only visible for admin role */}
      {isAdmin && (
        <Link href="/admin">
          <div className="flex items-center justify-center gap-1.5 py-1 border-t border-border/40 bg-orange-100 text-xs font-bold text-orange-600">
            <ShieldCheck className="w-3.5 h-3.5" />
            Admin
          </div>
        </Link>
      )}
    </nav>
  );
}

function TabItem({
  path,
  icon: Icon,
  label,
  active,
  badge,
  requireAuth,
  isAuthenticated,
}: {
  path: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: number;
  requireAuth?: boolean;
  isAuthenticated?: boolean;
}) {
  const href = requireAuth && !isAuthenticated ? getLoginUrl() : path;
  const isExternal = requireAuth && !isAuthenticated;

  const content = (
    <div className="flex flex-col items-center justify-center gap-1 w-16 py-1 relative">
      <div className="relative">
        <Icon
          className={`w-6 h-6 transition-colors duration-150 ${
            active ? "text-orange-600 fill-none" : "text-gray-400 fill-none"
          }`}
          strokeWidth={2}
          fill="none"
        />
        {badge != null && badge > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] bg-orange-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none shadow-md">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span
        className={`text-[11px] font-bold transition-colors duration-150 ${
          active ? "text-orange-600" : "text-gray-600"
        }`}
      >
        {label}
      </span>
    </div>
  );

  if (isExternal) {
    return <a href={href} className="no-underline">{content}</a>;
  }

  return <Link href={href} className="no-underline">{content}</Link>;
}
