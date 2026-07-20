import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatPrice, CHAT_MODE_LABELS, CHAT_MODE_COLORS } from "@shared/types";
import {
  ArrowLeft,
  CreditCard,
  MapPin,
  Package,
  Send,
  User,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

function formatTime(date: Date | string) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) {
    return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "เมื่อวาน " + d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function MessageBubble({
  content,
  messageType,
  isMe,
}: {
  content: string;
  messageType: string;
  isMe: boolean;
}) {
  const isSpecial = messageType === "shipping_address" || messageType === "payment_info";

  if (isSpecial) {
    const isShipping = messageType === "shipping_address";
    return (
      <div
        className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed border-2 ${
          isMe
            ? "bg-primary/10 border-primary/30 text-foreground rounded-br-sm"
            : "bg-muted border-border text-foreground rounded-bl-sm"
        }`}
      >
        <div className="flex items-center gap-2 mb-2 font-semibold text-xs uppercase tracking-wide opacity-70">
          {isShipping ? (
            <><MapPin className="w-3.5 h-3.5 text-blue-600" /> ที่อยู่จัดส่ง</>
          ) : (
            <><CreditCard className="w-3.5 h-3.5 text-green-600" /> ข้อมูลชำระเงิน</>
          )}
        </div>
        <pre className="whitespace-pre-wrap font-sans text-sm">{content}</pre>
      </div>
    );
  }

  return (
    <div
      className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
        isMe
          ? "bg-primary text-primary-foreground rounded-br-sm"
          : "bg-muted text-foreground rounded-bl-sm"
      }`}
    >
      {content}
    </div>
  );
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const conversationId = parseInt(id ?? "0");
  const { user, isAuthenticated } = useAuth();
  const [content, setContent] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
      }, 50);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  const { data, isLoading, refetch } = trpc.chat.getMessages.useQuery(
    { conversationId },
    { enabled: !!conversationId && isAuthenticated, refetchInterval: 3000 }
  );

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: () => {
      setContent("");
      refetch();
      utils.chat.getUnreadCount.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendShortcut = trpc.chat.sendShortcut.useMutation({
    onSuccess: () => {
      refetch();
      utils.chat.getUnreadCount.invalidate();
      toast.success("ส่งข้อมูลเรียบร้อย");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  function handleSend() {
    const text = content.trim();
    if (!text) return;
    sendMessage.mutate({ conversationId, content: text });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold">กรุณาเข้าสู่ระบบ</h2>
          <a href={getLoginUrl()}><Button>เข้าสู่ระบบ</Button></a>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto">
        <div className="border-b p-4 flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className={`h-10 w-2/3 rounded-2xl ${i % 2 === 0 ? "ml-auto" : ""}`} />
          ))}
        </div>
      </div>
    );
  }

  const conv = data?.conversation;
  const msgs = data?.messages ?? [];
  const product = conv?.product;
  const otherUser = conv?.otherUser;
  const isBuyer = conv?.isBuyer ?? false;
  const chatMode = conv?.chatMode ?? "c2c";

  return (
    <div className="bg-background flex flex-col" style={{ minHeight: "100svh" }}>
      <div className="flex flex-col max-w-2xl mx-auto w-full flex-1">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur px-3 py-2 flex items-center gap-2 shrink-0 sticky top-0 z-10">
          <Link href="/chats" className="text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm truncate">{otherUser?.name ?? "ผู้ใช้"}</p>
              <Badge className={`text-[10px] px-1.5 py-0 ${CHAT_MODE_COLORS[chatMode as keyof typeof CHAT_MODE_COLORS]} text-white border-0`}>
                {CHAT_MODE_LABELS[chatMode as keyof typeof CHAT_MODE_LABELS]}
              </Badge>
            </div>
            {product && (
              <p className="text-xs text-muted-foreground truncate">
                {product.title} · {formatPrice(parseFloat(String(product.price)))}
              </p>
            )}
          </div>
          {product && (
            <Link href={`/products/${conv?.productId}`} className="shrink-0">
              <div className="w-9 h-9 rounded-lg overflow-hidden border bg-muted">
                {(product.images as string[])?.[0] ? (
                  <img src={(product.images as string[])[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-4 h-4 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            </Link>
          )}
        </div>

        {/* Direct chat notice */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800 px-4 py-2 text-xs text-blue-700 dark:text-blue-300 text-center space-y-0.5">
          <p>💬 คุยตรงกันในแชท · โอนเงินนอกแอป · ใช้ปุ่มลัดส่งที่อยู่/บัญชีได้เลย</p>
          <p className="opacity-80">ตกลงราคาและการส่งให้ครบก่อนโอน — อย่าแชร์ OTP หรือรหัสผ่าน</p>
        </div>

        {product && product.status !== "active" && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-700 dark:text-amber-300 text-center">
            สินค้านี้ไม่พร้อมขายแล้ว
          </div>
        )}

        {/* Messages */}
        <div ref={messagesRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 pb-2">
          {msgs.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              เริ่มการสนทนา คุยเรื่องราคาและนัดโอนเงินกันได้เลย
            </div>
          )}
          {msgs.map((msg, idx) => {
            const isMe = msg.senderId === user?.id;
            const showTime =
              idx === msgs.length - 1 ||
              new Date(msgs[idx + 1].createdAt).getTime() - new Date(msg.createdAt).getTime() > 300000;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <MessageBubble
                  content={msg.content}
                  messageType={msg.messageType}
                  isMe={isMe}
                />
                {showTime && (
                  <span className="text-xs text-muted-foreground mt-1 px-1">
                    {formatTime(msg.createdAt)}
                  </span>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Shortcut + quick replies */}
        <div className="border-t bg-muted/30 px-3 py-2 flex gap-2 overflow-x-auto shrink-0 flex-wrap">
          {[
            "สินค้ายังมีไหม",
            "ขอรูปตำหนิเพิ่ม",
            "ส่งแบบไหนได้บ้าง",
            "ราคาลดได้ไหม",
          ].map((reply) => (
            <Button
              key={reply}
              variant="outline"
              size="sm"
              className="shrink-0 text-xs rounded-full h-8"
              onClick={() => setContent(reply)}
            >
              {reply}
            </Button>
          ))}
          {isBuyer && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 text-xs rounded-full border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => sendShortcut.mutate({ conversationId, shortcut: "shipping_address" })}
              disabled={sendShortcut.isPending}
            >
              <MapPin className="w-3.5 h-3.5" />
              ส่งที่อยู่จัดส่ง
            </Button>
          )}
          {!isBuyer && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 text-xs rounded-full border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => sendShortcut.mutate({ conversationId, shortcut: "payment_info" })}
              disabled={sendShortcut.isPending}
            >
              <CreditCard className="w-3.5 h-3.5" />
              ส่งเลขบัญชี/พร้อมเพย์
            </Button>
          )}
        </div>

        {/* Input */}
        <div
          className="border-t bg-background px-3 py-2 flex items-center gap-2"
          style={{
            position: "sticky",
            bottom: 0,
            paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
          }}
        >
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="พิมพ์ข้อความ..."
            className="flex-1 rounded-full bg-muted border-0 focus-visible:ring-1 resize-none"
            disabled={sendMessage.isPending}
          />
          <Button
            size="icon"
            className="rounded-full w-10 h-10 shrink-0"
            onClick={handleSend}
            disabled={!content.trim() || sendMessage.isPending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
