import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

// เก็บ scroll position ของแต่ละ path ไว้ใน memory (ไม่ต้องใช้ localStorage เพราะ refresh แล้วควร scroll top)
const scrollPositions: Record<string, number> = {};

// หน้าที่ไม่ต้องการ restore scroll (ให้เริ่มต้นจากบนเสมอ)
const ALWAYS_TOP_PATHS = ["/sell", "/checkout", "/orders/"];

function shouldRestoreScroll(path: string): boolean {
  return !ALWAYS_TOP_PATHS.some((p) => path.startsWith(p));
}

/**
 * ScrollMemory — วาง component นี้ใน App.tsx เพื่อจดจำ scroll position ทุกหน้าอัตโนมัติ
 * ไม่ต้องแก้ไขแต่ละ page component
 */
export default function ScrollMemory() {
  const [location] = useLocation();
  const prevLocation = useRef<string | null>(null);
  const isRestoring = useRef(false);

  useEffect(() => {
    const prev = prevLocation.current;

    // บันทึก scroll position ของหน้าก่อนหน้า
    if (prev !== null && prev !== location) {
      scrollPositions[prev] = window.scrollY;
    }

    // Restore scroll position ของหน้าใหม่
    if (!isRestoring.current) {
      isRestoring.current = true;
      const saved = scrollPositions[location];
      if (saved !== undefined && shouldRestoreScroll(location)) {
        // รอ DOM render เสร็จก่อน restore
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: saved, behavior: "instant" });
            isRestoring.current = false;
          });
        });
      } else {
        window.scrollTo({ top: 0, behavior: "instant" });
        isRestoring.current = false;
      }
    }

    prevLocation.current = location;
  }, [location]);

  // บันทึก scroll position ระหว่าง scroll
  useEffect(() => {
    function handleScroll() {
      if (prevLocation.current !== null) {
        scrollPositions[prevLocation.current] = window.scrollY;
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return null;
}
