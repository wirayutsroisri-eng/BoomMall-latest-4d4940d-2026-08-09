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
import { SellPhotoEntry } from "@/components/SellPhotoEntry";

export default function BottomNav() {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = (user as { role?: string } | null)?.role === "admin";
  const [location] = useLocation();

  const { data: unreadData } = trpc.chat.getUnreadCount.useQuery(undefined, {
    enabled: isAuthenticated && !isDevBypassEnabled(),
    refetchInterval: 15000,
  });
  const unreadCount = unreadData?.count ?? 0;

  if (/^\/chat\/\d+/.test(location) || location.startsWith("/sell")) return null;

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-card border-t border-border/60 safe-area-bottom shadow-lg shadow-black/5"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="flex items-center justify-around h-[70px] max-w-lg mx-auto px-1">

        <TabItem
          path="/"
          icon={Home}
          label="หน้าแรก"
          active={isActive("/")}
        />

        <TabItem
          path="/products"
          icon={Search}
          label="ค้นหา"
          active={isActive("/products")}
        />

        <SellPhotoEntry>
          {(openPicker, busy) => (
            <div className="flex flex-col items-center justify-center -mt-8">
              <button
                type="button"
                onClick={openPicker}
                disabled={busy}
                className="relative w-16 h-16 rounded-full bg-orange-600 hover:bg-orange-700 flex items-center justify-center shadow-lg shadow-orange-600/40 active:scale-95 transition-all duration-150 disabled:opacity-70"
                aria-label="ลงรูปภาพและวิดีโอ"
              >
                {busy ? (
                  <div className="w-7 h-7 border-3 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Camera className="w-8 h-8 text-white stroke-[1.5]" />
                )}
              </button>
              <span className="text-[11px] font-bold text-orange-600 mt-1">
                {busy ? "กำลังโหลด..." : "ลงขาย"}
              </span>
            </div>
          )}
        </SellPhotoEntry>

        <TabItem
          path="/chats"
          icon={MessageCircle}
          label="แชท"
          active={isActive("/chats") || isActive("/chat/")}
          badge={unreadCount}
          requireAuth={true}
          isAuthenticated={isAuthenticated}
        />

        <TabItem
          path="/profile"
          icon={User}
          label="ฉัน"
          active={isActive("/profile") || isActive("/my-orders") || isActive("/seller")}
          requireAuth={true}
          isAuthenticated={isAuthenticated}
        />
      </div>
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
