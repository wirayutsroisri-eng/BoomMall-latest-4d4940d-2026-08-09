import { trpc } from "@/lib/trpc";
import VideoFeedItem, { type SwipeState } from "@/components/VideoFeedItem";
import FeedProductReveal from "@/components/FeedProductReveal";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Store } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import type { ChatMode } from "@shared/types";
import { getMockFeedPage, isDevBypassEnabled } from "@/devBypass";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";

const PAGE_SIZE = 10;
type FeedMode = "for-you" | "following";

export default function HomePage() {
  const bypass = isDevBypassEnabled();
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [feedMode, setFeedMode] = useState<FeedMode>("for-you");
  const [offset, setOffset] = useState(0);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedSeed, setFeedSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mockReady, setMockReady] = useState(!bypass);
  const feedRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [swipeState, setSwipeState] = useState<SwipeState>({ offset: 0, isDragging: false, isOpen: false });
  const [forceCloseSwipe, setForceCloseSwipe] = useState(0);

  const activeProduct = allProducts[activeIndex] ?? null;
  const showReveal = swipeState.isOpen || swipeState.isDragging || swipeState.offset !== 0;

  const { data: productsData, isLoading } = trpc.products.list.useQuery(
    {
      limit: PAGE_SIZE,
      offset,
      sortBy: "smart",
      seed: feedSeed,
      followedOnly: feedMode === "following",
    },
    { staleTime: 0, gcTime: 0, enabled: !bypass, retry: false }
  );

  const switchFeedMode = (mode: FeedMode) => {
    setFeedMode(mode);
    setOffset(0);
    setAllProducts([]);
    setActiveIndex(0);
    setForceCloseSwipe((n) => n + 1);
    setSwipeState({ offset: 0, isDragging: false, isOpen: false });
    feedRef.current?.scrollTo({ top: 0 });
  };

  const startConversation = trpc.chat.startConversation.useMutation({
    onSuccess: (data) => navigate(`/chat/${data.conversationId}`),
    onError: (err) => toast.error(err.message),
  });

  // โหลด mock feed เมื่อ bypass
  useEffect(() => {
    if (!bypass) return;
    const items = getMockFeedPage(offset, PAGE_SIZE, {
      followedOnly: feedMode === "following",
    });
    if (offset === 0) {
      setAllProducts(items);
    } else if (items.length > 0) {
      setAllProducts((prev) => [...prev, ...items]);
    }
    setMockReady(true);
  }, [bypass, offset, feedSeed, feedMode]);

  const handleRefreshFeed = useCallback(() => {
    setIsRefreshing(true);
    setOffset(0);
    setAllProducts([]);
    setActiveIndex(0);
    setFeedSeed(Math.floor(Math.random() * 100000));
    feedRef.current?.scrollTo({ top: 0 });
    if (bypass) {
      setMockReady(false);
      setTimeout(() => setMockReady(true), 50);
    }
    setTimeout(() => setIsRefreshing(false), 600);
  }, [bypass]);

  useEffect(() => {
    if (bypass) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        handleRefreshFeed();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [bypass, handleRefreshFeed]);

  useEffect(() => {
    if (bypass) return;
    if (productsData?.items) {
      if (offset === 0) {
        setAllProducts(productsData.items);
      } else {
        setAllProducts((prev) => [...prev, ...productsData.items]);
      }
    }
  }, [bypass, productsData, offset]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number(entry.target.getAttribute("data-index"));
            if (!isNaN(idx) && idx !== activeIndex) {
              setForceCloseSwipe((n) => n + 1);
              setSwipeState({ offset: 0, isDragging: false, isOpen: false });
              setActiveIndex(idx);
            }
          }
        }
      },
      { threshold: [0.6], root: feedRef.current }
    );

    itemRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [allProducts.length, activeIndex]);

  const handleSwipeChange = useCallback((state: SwipeState) => {
    setSwipeState(state);
  }, []);

  const handleSwipeClose = useCallback(() => {
    setSwipeState({ offset: 0, isDragging: false, isOpen: false });
  }, []);

  useEffect(() => {
    if (activeIndex < allProducts.length - 3) return;
    if (allProducts.length === 0) return;

    setOffset((prev) => {
      if (bypass) {
        const next = getMockFeedPage(prev + PAGE_SIZE, PAGE_SIZE, {
          followedOnly: feedMode === "following",
        });
        if (next.length === 0) return prev;
        return prev + PAGE_SIZE;
      }
      if (isLoading || productsData?.items.length !== PAGE_SIZE) return prev;
      return prev + PAGE_SIZE;
    });
  }, [activeIndex, allProducts.length, isLoading, productsData, bypass, feedMode]);

  function handleChat(productId: number, chatMode: ChatMode) {
    if (bypass) {
      toast.info(`[Dev UI] ทักแชท ${chatMode.toUpperCase()} — สินค้า #${productId}`, {
        description: "โหมด bypass: ยังไม่เชื่อม backend",
      });
      return;
    }
    startConversation.mutate({ productId, chatMode });
  }

  const showLoading = bypass ? !mockReady && offset === 0 : offset === 0 && isLoading;

  if (showLoading) {
    return (
      <div className="h-[100dvh] bg-background flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-none" />
      </div>
    );
  }

  if (allProducts.length === 0) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center text-foreground gap-4 px-6 text-center">
        <Store className="w-12 h-12 text-muted-foreground/40" />
        {feedMode === "following" ? (
          <>
            <p className="text-sm font-semibold">ยังไม่มีสินค้าจากร้านที่ติดตาม</p>
            <p className="text-xs opacity-60">ติดตามร้านค้าจากหน้ารายละเอียดสินค้า แล้วกลับมาดูที่นี่</p>
            {!isAuthenticated && !bypass && (
              <a href={getLoginUrl()} className="text-sm px-4 py-2 rounded-full bg-orange-600 text-white">
                เข้าสู่ระบบ
              </a>
            )}
            <button
              onClick={() => switchFeedMode("for-you")}
              className="text-sm px-4 py-2 rounded-full bg-muted hover:bg-muted/80"
            >
              ดูสินค้าแนะนำ
            </button>
          </>
        ) : (
          <>
            <p className="text-sm opacity-60">ยังไม่มีสินค้าใน feed</p>
            <button
              onClick={handleRefreshFeed}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-full bg-muted hover:bg-muted/80"
            >
              <RefreshCw className="w-4 h-4" /> รีเฟรช
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] bg-background overflow-hidden">
      {bypass && (
        <div className="absolute top-[max(env(safe-area-inset-top),8px)] left-3 z-30 text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-500/90 text-black">
          DEV BYPASS
        </div>
      )}

      {/* Feed mode tabs — จาก Alpha v39 */}
      <div className="absolute top-[max(env(safe-area-inset-top),8px)] left-1/2 -translate-x-1/2 z-30 flex gap-1 p-0.5 rounded-full bg-black/50 backdrop-blur-sm border border-white/20">
        <button
          onClick={() => switchFeedMode("for-you")}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
            feedMode === "for-you" ? "bg-white text-black" : "text-white/70"
          }`}
        >
          สำหรับคุณ
        </button>
        <button
          onClick={() => {
            if (!isAuthenticated && !bypass) {
              window.location.href = getLoginUrl();
              return;
            }
            switchFeedMode("following");
          }}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
            feedMode === "following" ? "bg-white text-black" : "text-white/70"
          }`}
        >
          กำลังติดตาม
        </button>
      </div>

      <Link href="/products?filter=wholesale">
        <button
          type="button"
          className="absolute top-[max(calc(env(safe-area-inset-top)+44px),56px)] left-3 z-30 text-[10px] font-semibold px-2.5 py-1.5 rounded-full bg-red-600/90 text-white border border-red-400/30"
        >
          ▦ ตลาดราคาส่ง
        </button>
      </Link>

      <button
        onClick={handleRefreshFeed}
        disabled={isRefreshing || (!bypass && isLoading)}
        className="absolute top-[max(calc(env(safe-area-inset-top)+44px),56px)] right-16 z-30 flex items-center gap-1 text-[10px] text-white/80 font-semibold px-2.5 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
        สุ่มใหม่
      </button>

      <div
        ref={feedRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{
          scrollSnapType: "y mandatory",
          overflow: swipeState.isOpen ? "hidden" : undefined,
        }}
      >
        {allProducts.map((product, idx) => (
          <div
            key={`${product.id}-${idx}`}
            ref={(el) => { itemRefs.current[idx] = el; }}
            data-index={idx}
          >
            <VideoFeedItem
              product={product}
              isActive={idx === activeIndex}
              onChat={(mode) => handleChat(product.id, mode)}
              isChatPending={startConversation.isPending}
              onSwipeChange={idx === activeIndex ? handleSwipeChange : undefined}
              onSwipeClose={handleSwipeClose}
              forceCloseKey={idx === activeIndex ? forceCloseSwipe : 0}
            />
          </div>
        ))}

        {!bypass && isLoading && offset > 0 && (
          <div className="h-20 flex items-center justify-center snap-start">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {showReveal && activeProduct && (
        <FeedProductReveal
          product={activeProduct}
          offset={swipeState.offset}
          isDragging={swipeState.isDragging}
          isOpen={swipeState.isOpen}
          onClose={() => {
            setForceCloseSwipe((n) => n + 1);
            handleSwipeClose();
          }}
        />
      )}
    </div>
  );
}
