import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

const scrollPositions: Record<string, number> = {};

/**
 * useScrollMemory — จดจำ scroll position ของแต่ละ URL path
 * เรียกใช้ใน component ที่ต้องการให้จดจำตำแหน่ง scroll
 *
 * @param key  optional key เพิ่มเติม เช่น tab ที่เลือก (ถ้าหน้าเดียวกันมีหลาย state)
 */
export function useScrollMemory(key?: string) {
  const [location] = useLocation();
  const scrollKey = key ? `${location}::${key}` : location;
  const restoredRef = useRef(false);

  // Restore scroll position เมื่อ component mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = scrollPositions[scrollKey];
    if (saved !== undefined) {
      // ใช้ requestAnimationFrame เพื่อรอให้ DOM render เสร็จก่อน
      requestAnimationFrame(() => {
        window.scrollTo({ top: saved, behavior: "instant" });
      });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [scrollKey]);

  // Save scroll position เมื่อ scroll หรือ unmount
  useEffect(() => {
    function handleScroll() {
      scrollPositions[scrollKey] = window.scrollY;
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      // บันทึกครั้งสุดท้ายตอน unmount
      scrollPositions[scrollKey] = window.scrollY;
      window.removeEventListener("scroll", handleScroll);
    };
  }, [scrollKey]);
}
