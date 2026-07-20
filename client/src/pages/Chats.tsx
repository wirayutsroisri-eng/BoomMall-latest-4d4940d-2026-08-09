import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

import { MessageCircle, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { CHAT_MODE_LABELS, CHAT_MODE_COLORS } from "@shared/types";

function formatTime(date: Date | string | null) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export default function ChatsPage() {
  const { isAuthenticated } = useAuth();

  const { data: conversations, isLoading } = trpc.chat.getConversations.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground/20" />
          <h2 className="text-xl font-semibold">กรุณาเข้าสู่ระบบ</h2>
          <a href={getLoginUrl()}><Button>เข้าสู่ระบบ</Button></a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <MessageCircle className="w-6 h-6" /> ข้อความ
        </h1>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-xl border">
                <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && (!conversations || conversations.length === 0) && (
          <div className="text-center py-24 space-y-3">
            <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground/20" />
            <p className="text-muted-foreground">ยังไม่มีการสนทนา</p>
            <Link href="/products">
              <Button variant="outline">เลือกซื้อสินค้า</Button>
            </Link>
          </div>
        )}

        <div className="space-y-1">
          {conversations?.map((conv) => {
            const images = (conv.product?.images ?? []) as string[];
            return (
              <Link key={conv.id} href={`/chat/${conv.id}`}>
                <div className="flex items-center gap-3 p-3.5 rounded-xl hover:bg-muted/50 transition cursor-pointer border border-transparent hover:border-border">
                  {/* Product image */}
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted border shrink-0">
                    {images[0] ? (
                      <img src={images[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-5 h-5 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {conv.otherUser?.name ?? "ผู้ใช้"}
                        </p>
                        <Badge className={`text-[9px] px-1 py-0 shrink-0 ${CHAT_MODE_COLORS[conv.chatMode as keyof typeof CHAT_MODE_COLORS] ?? "bg-gray-500"} text-white border-0`}>
                          {CHAT_MODE_LABELS[conv.chatMode as keyof typeof CHAT_MODE_LABELS] ?? conv.chatMode}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {conv.product?.title ?? "สินค้า"}
                    </p>
                    {conv.lastMessage && (
                      <p className={`text-xs truncate mt-0.5 ${conv.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {conv.lastMessage.content}
                      </p>
                    )}
                  </div>

                  {/* Unread badge */}
                  {conv.unread > 0 && (
                    <Badge className="shrink-0 min-w-[20px] h-5 text-xs px-1.5 rounded-full">
                      {conv.unread > 99 ? "99+" : conv.unread}
                    </Badge>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
