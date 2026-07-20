import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import {
  ChevronDown,
  LogOut,
  MessageCircle,
  Package,
  Plus,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  User,
} from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

async function getGravatarMd5Url(email?: string | null, size = 80): Promise<string | undefined> {
  if (!email) return undefined;
  const trimmed = email.trim().toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(trimmed);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `https://www.gravatar.com/avatar/${hashHex}?d=mp&s=${size}`;
}

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: cartData } = trpc.cart.getCart.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { data: unreadData } = trpc.chat.getUnreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 15000,
  });

  const cartCount = cartData?.items?.length ?? 0;
  const unreadCount = unreadData?.count ?? 0;

  // Gravatar URL จาก email ของ user
  const [gravatarUrl, setGravatarUrl] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    if (user?.email) {
      getGravatarMd5Url(user.email, 80).then(url => setGravatarUrl(url));
    }
  }, [user?.email]);

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border/60"
      style={{ boxShadow: "0 1px 0 oklch(0.9 0.008 75)" }}>
      <div className="container px-4 sm:px-6">
        <div className="flex items-center justify-between h-[60px] gap-2 sm:gap-4">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <ShoppingBag className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-bold text-lg text-primary tracking-tight" style={{ fontFamily: "'Noto Serif Thai', serif" }}>
                BoomMall
              </span>
              <span className="text-[10px] text-muted-foreground font-normal tracking-wide uppercase">ตลาดสินค้ามือสอง</span>
            </div>
          </Link>

          {/* Search bar — center */}
          <div className="flex-1 max-w-lg hidden md:block">
            <Link href="/products">
              <div className="flex items-center gap-2.5 px-4 py-2 bg-muted/70 rounded-full text-muted-foreground text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-all duration-150 border border-transparent hover:border-border/50">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-sm">คุณหาสินค้าอะไรอยู่?</span>
              </div>
            </Link>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-0.5 sm:gap-1 pr-1 sm:pr-0">
            {isAuthenticated ? (
              <>
                {/* User menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 p-1 pl-1.5 rounded-full hover:bg-muted transition-colors duration-150 ml-1 border border-border/40">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={user?.avatar ?? gravatarUrl} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                          {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden sm:block text-xs font-medium text-foreground max-w-[80px] truncate pr-1">
                        {user?.name?.split(" ")[0] ?? "บัญชี"}
                      </span>
                      <ChevronDown className="w-3 h-3 text-muted-foreground hidden sm:block mr-1" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-lg border-border/60 p-1">
                    <DropdownMenuLabel className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-sm text-foreground">{user?.name}</span>
                        <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                      <Link href="/profile" className="flex items-center gap-2.5 px-3 py-2">
                        <User className="w-4 h-4 text-muted-foreground" /> โปรไฟล์
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                      <Link href="/chats" className="flex items-center gap-2.5 px-3 py-2">
                        <MessageCircle className="w-4 h-4 text-muted-foreground" /> ข้อความ
                        {unreadCount > 0 && (
                          <span className="ml-auto bg-primary text-primary-foreground text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {unreadCount}
                          </span>
                        )}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                      <Link href="/cart" className="flex items-center gap-2.5 px-3 py-2">
                        <ShoppingCart className="w-4 h-4 text-muted-foreground" /> ตะกร้าสินค้า
                        {cartCount > 0 && (
                          <span className="ml-auto bg-primary text-primary-foreground text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {cartCount}
                          </span>
                        )}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                      <Link href="/my-orders" className="flex items-center gap-2.5 px-3 py-2">
                        <Package className="w-4 h-4 text-blue-500" />
                        <span>คำสั่งซื้อของฉัน</span>
                        <span className="ml-auto text-[10px] text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded-full">ผู้ซื้อ</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                      <Link href="/seller/orders" className="flex items-center gap-2.5 px-3 py-2">
                        <ShoppingBag className="w-4 h-4 text-orange-500" />
                        <span>คำสั่งขายของฉัน</span>
                        <span className="ml-auto text-[10px] text-orange-400 bg-orange-50 px-1.5 py-0.5 rounded-full">ผู้ขาย</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                      <Link href="/seller/dashboard" className="flex items-center gap-2.5 px-3 py-2">
                        <Store className="w-4 h-4 text-muted-foreground" /> จัดการร้านค้า
                      </Link>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator className="my-1" />
                        <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                          <Link href="/admin" className="flex items-center gap-2.5 px-3 py-2 text-primary">
                            <Settings className="w-4 h-4" /> Admin Dashboard
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem
                      className="rounded-lg text-destructive cursor-pointer px-3 py-2"
                      onClick={() => logout()}
                    >
                      <LogOut className="w-4 h-4 mr-2.5" /> ออกจากระบบ
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <a href={getLoginUrl()}>
                  <Button variant="ghost" size="sm" className="text-sm font-medium">เข้าสู่ระบบ</Button>
                </a>
                <a href={getLoginUrl()}>
                  <Button size="sm" className="rounded-full px-5 text-sm font-semibold shadow-sm">สมัครสมาชิก</Button>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
