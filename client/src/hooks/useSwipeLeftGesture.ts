import { useCallback, useRef, useState } from "react";

const LOCK_PX = 10;
const OPEN_RATIO = 0.22;
const MIN_OPEN_PX = 72;

type UseSwipeLeftGestureOptions = {
  enabled?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
};

export function useSwipeLeftGesture(options: UseSwipeLeftGestureOptions = {}) {
  const { enabled = true, onOpen, onClose } = options;
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    lock: null as null | "horizontal" | "vertical",
    pointerId: -1,
  });

  const getWidth = () =>
    typeof window !== "undefined" ? window.innerWidth : 375;

  const clampOffset = useCallback((value: number) => {
    const w = getWidth();
    return Math.max(-w, Math.min(0, value));
  }, []);

  const shouldOpen = useCallback((value: number) => {
    const w = getWidth();
    return Math.abs(value) >= Math.max(MIN_OPEN_PX, w * OPEN_RATIO);
  }, []);

  const snapTo = useCallback(
    (open: boolean) => {
      const w = getWidth();
      setOffset(open ? -w : 0);
      setIsOpen(open);
      if (open) onOpen?.();
      else onClose?.();
    },
    [onClose, onOpen]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || isOpen) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-no-swipe]")) return;

      gestureRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        lock: null,
        pointerId: e.pointerId,
      };
      setIsDragging(false);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [enabled, isOpen]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || gestureRef.current.pointerId !== e.pointerId) return;

      const g = gestureRef.current;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;

      if (!g.lock) {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        g.lock = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }

      if (g.lock === "vertical") return;

      if (dx > 8) return;

      e.preventDefault();
      setIsDragging(true);
      setOffset(clampOffset(dx));
    },
    [clampOffset, enabled]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (gestureRef.current.pointerId !== e.pointerId) return;

      const g = gestureRef.current;
      gestureRef.current.pointerId = -1;

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      if (g.lock !== "horizontal") {
        setIsDragging(false);
        return;
      }

      const current = clampOffset(e.clientX - g.startX);
      setIsDragging(false);

      if (shouldOpen(current)) {
        snapTo(true);
      } else {
        setOffset(0);
      }
    },
    [clampOffset, shouldOpen, snapTo]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (gestureRef.current.pointerId !== e.pointerId) return;
      gestureRef.current.pointerId = -1;
      gestureRef.current.lock = null;
      setIsDragging(false);
      if (!isOpen) setOffset(0);
    },
    [isOpen]
  );

  const closePanel = useCallback(() => {
    setOffset(0);
    setIsOpen(false);
    onClose?.();
  }, [onClose]);

  const openPanel = useCallback(() => {
    snapTo(true);
  }, [snapTo]);

  return {
    offset,
    isDragging,
    isOpen,
    closePanel,
    openPanel,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    style: {
      transform: `translateX(${offset}px)`,
      transition:
        isDragging ? "none" : "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)",
      touchAction: "pan-y" as const,
    },
  };
}
