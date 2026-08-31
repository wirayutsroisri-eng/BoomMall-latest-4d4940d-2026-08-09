import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { isDevBypassEnabled } from "@/devBypass";
import { useSwipeLeftGesture } from "@/hooks/useSwipeLeftGesture";
import { formatPrice, CHAT_MODE_COLORS, type ChatMode } from "@shared/types";
import { ChevronLeft, Heart, MapPin, Package, Store, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type FeedProduct = {
  id: number;
  title: string;
  description?: string | null;
  price: string;
  images?: string[] | null;
  videoUrl?: string | null;
  listingType?: "c2c" | "b2b" | "both";
  location?: string | null;
  sellerId: number;
  priceTiers?: { minQty: number; pricePerUnit: number }[];
};

export type SwipeState = {
  offset: number;
  isDragging: boolean;
  isOpen: boolean;
};

interface VideoFeedItemProps {
  product: FeedProduct;
  isActive: boolean;
  onChat: (chatMode: ChatMode) => void;
  isChatPending?: boolean;
  onSwipeChange?: (state: SwipeState) => void;
  onSwipeOpen?: () => void;
  onSwipeClose?: () => void;
  forceCloseKey?: number;
}

function supportsMode(listingType: string | undefined, mode: ChatMode): boolean {
  if (!listingType || listingType === "both") return true;
  return listingType === mode;
}

export default function VideoFeedItem({
  product,
  isActive,
  onChat,
  isChatPending,
  onSwipeChange,
  onSwipeOpen,
  onSwipeClose,
  forceCloseKey = 0,
}: VideoFeedItemProps) {
  const bypass = isDevBypassEnabled();
  const { isAuthenticated } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const backdropVideoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [localLiked, setLocalLiked] = useState(false);
  const images = (product.images ?? []) as string[];
  const hasVideo = !!product.videoUrl;

  const swipe = useSwipeLeftGesture({
    enabled: isActive,
    onOpen: onSwipeOpen,
    onClose: onSwipeClose,
  });

  useEffect(() => {
    if (!isActive) return;
    onSwipeChange?.({
      offset: swipe.offset,
      isDragging: swipe.isDragging,
      isOpen: swipe.isOpen,
    });
  }, [isActive, swipe.offset, swipe.isDragging, swipe.isOpen, onSwipeChange]);

  useEffect(() => {
    if (forceCloseKey > 0) swipe.closePanel();
  }, [forceCloseKey]);

  const { data: likeData } = trpc.likes.getLikeStatus.useQuery(
    { productId: product.id },
    { staleTime: 30_000, enabled: !bypass && isActive }
  );

  const utils = trpc.useUtils();
  const toggleLike = trpc.likes.toggleLike.useMutation({
    onSuccess: () => utils.likes.getLikeStatus.invalidate({ productId: product.id }),
    onError: () => toast.error("ไม่สามารถกดถูกใจได้"),
  });

  useEffect(() => {
    const video = videoRef.current;
    const backdrop = backdropVideoRef.current;
    if (!video || !hasVideo) return;
    if (isActive && !swipe.isOpen) {
      video.play().catch(() => {});
      backdrop?.play().catch(() => {});
    } else {
      video.pause();
      backdrop?.pause();
      if (!isActive) {
        video.currentTime = 0;
        if (backdrop) backdrop.currentTime = 0;
      }
    }
  }, [isActive, hasVideo, swipe.isOpen]);

  function handleChat(mode: ChatMode) {
    if (!isAuthenticated && !bypass) return;
    onChat(mode);
  }

  function handleLike() {
    if (bypass) {
      setLocalLiked((v) => !v);
      return;
    }
    if (!isAuthenticated) return;
    toggleLike.mutate({ productId: product.id });
  }

  const liked = bypass ? localLiked : (likeData?.liked ?? false);
  const showB2B = supportsMode(product.listingType, "b2b");
  const showC2C = supportsMode(product.listingType, "c2c");

  const poster = images[0] ?? undefined;

  return (
    <div
      className="relative h-[100dvh] w-full snap-start snap-always shrink-0 bg-transparent overflow-hidden select-none"
      style={isActive ? swipe.style : undefined}
      {...(isActive ? swipe.handlers : {})}
    >
      {/* Blurred fill so 16:9 clips never show a solid black letterbox */}
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl brightness-110 saturate-125 pointer-events-none"
          draggable={false}
        />
      )}

      {hasVideo && (
        <video
          ref={backdropVideoRef}
          src={product.videoUrl!}
          className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl brightness-110 pointer-events-none"
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden
        />
      )}

      {hasVideo ? (
        <video
          ref={videoRef}
          src={product.videoUrl!}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none bg-transparent"
          loop
          muted={muted}
          playsInline
          preload="metadata"
          poster={poster}
        />
      ) : images[0] ? (
        <img
          src={images[0]}
          alt={product.title}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted pointer-events-none">
          <Package className="w-16 h-16 text-muted-foreground/40" />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45 pointer-events-none" />

      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-600 to-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            B
          </div>
          <span className="font-bold text-white text-sm drop-shadow-md">BoomMall</span>
        </div>
        {isActive && !swipe.isOpen && Math.abs(swipe.offset) < 20 && (
          <div className="flex items-center gap-1 text-[10px] text-white/50 font-medium animate-pulse">
            <ChevronLeft className="w-3 h-3" />
            ปัดซ้ายดูรายละเอียด
          </div>
        )}
      </div>

      <div
        className="absolute right-3 bottom-36 z-20 flex flex-col items-center gap-3"
        data-no-swipe
      >
        {showB2B && (
          <button
            onClick={() => handleChat("b2b")}
            disabled={isChatPending}
            className="flex flex-col items-center gap-1 transition-transform active:scale-95 disabled:opacity-60"
          >
            <div className={`w-14 h-14 rounded-2xl ${CHAT_MODE_COLORS.b2b} shadow-lg shadow-red-900/40 flex items-center justify-center border-2 border-white/30`}>
              <Store className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] font-bold text-white text-center leading-tight max-w-[72px] drop-shadow-md">
              ทักแชท<br />ราคาส่ง B2B
            </span>
          </button>
        )}

        {showC2C && (
          <button
            onClick={() => handleChat("c2c")}
            disabled={isChatPending}
            className="flex flex-col items-center gap-1 transition-transform active:scale-95 disabled:opacity-60"
          >
            <div className={`w-14 h-14 rounded-2xl ${CHAT_MODE_COLORS.c2c} shadow-lg shadow-blue-900/40 flex items-center justify-center border-2 border-white/30`}>
              <Package className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] font-bold text-white text-center leading-tight max-w-[72px] drop-shadow-md">
              ทักแชท<br />ซื้อของมือสอง
            </span>
          </button>
        )}

        <button onClick={handleLike} className="flex flex-col items-center gap-1 mt-1">
          <div className={`w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/20 ${liked ? "text-red-500" : "text-white"}`}>
            <Heart className={`w-5 h-5 ${liked ? "fill-red-500" : ""}`} />
          </div>
        </button>

        {hasVideo && (
          <button
            onClick={() => setMuted((m) => !m)}
            className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/20 text-white"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-16 z-10 px-4 pb-[calc(80px+env(safe-area-inset-bottom))] pointer-events-none">
        <h3 className="text-white font-bold text-base leading-snug mb-1 drop-shadow-md line-clamp-2">
          {product.title}
        </h3>
        <p className="text-orange-400 font-bold text-lg drop-shadow-md mb-1">
          {formatPrice(parseFloat(product.price))}
        </p>
        {product.location && (
          <p className="text-white/80 text-xs flex items-center gap-1 mb-1">
            <MapPin className="w-3 h-3" /> {product.location}
          </p>
        )}
        {product.description && (
          <p className="text-white/70 text-xs line-clamp-2 drop-shadow-sm">{product.description}</p>
        )}
      </div>
    </div>
  );
}
