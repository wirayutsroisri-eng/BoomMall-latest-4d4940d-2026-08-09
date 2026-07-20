import { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface CountdownTimerProps {
  expiresAt: Date | string | null | undefined;
  /** แสดงแบบ compact (บน card) หรือ full (บน detail page) */
  variant?: "compact" | "full";
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number; // milliseconds
}

function calcTimeLeft(expiresAt: Date | string): TimeLeft {
  const target = new Date(expiresAt).getTime();
  const now = Date.now();
  const total = target - now;

  if (total <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };

  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((total % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, total };
}

export function CountdownTimer({ expiresAt, variant = "compact", className = "" }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    // คำนวณทันทีก่อน interval แรก
    setTimeLeft(calcTimeLeft(expiresAt));

    const interval = setInterval(() => {
      const t = calcTimeLeft(expiresAt);
      setTimeLeft(t);
      if (t.total <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt || !timeLeft) return null;

  const isExpired = timeLeft.total <= 0;
  const isUrgent = timeLeft.total > 0 && timeLeft.days <= 3; // ≤3 วัน
  const isWarning = timeLeft.total > 0 && timeLeft.days <= 7; // ≤7 วัน

  const colorClass = isExpired
    ? "text-red-600"
    : isUrgent
    ? "text-red-500"
    : isWarning
    ? "text-amber-600"
    : "text-muted-foreground";

  if (isExpired) {
    return (
      <div className={`flex items-center gap-1 text-xs text-red-500 font-medium ${className}`}>
        <AlertTriangle className="w-3 h-3" />
        <span>หมดอายุแล้ว</span>
      </div>
    );
  }

  if (variant === "compact") {
    // แสดงบน ProductCard — กระชับ
    return (
      <div className={`flex items-center gap-1 text-xs ${colorClass} ${className}`}>
        <Clock className="w-3 h-3 shrink-0" />
        {timeLeft.days > 0 ? (
          <span>
            {timeLeft.days}ว {String(timeLeft.hours).padStart(2, "0")}:{String(timeLeft.minutes).padStart(2, "0")}:{String(timeLeft.seconds).padStart(2, "0")}
          </span>
        ) : (
          <span>
            {String(timeLeft.hours).padStart(2, "0")}:{String(timeLeft.minutes).padStart(2, "0")}:{String(timeLeft.seconds).padStart(2, "0")}
          </span>
        )}
      </div>
    );
  }

  // variant="full" — แสดงบน ProductDetail
  return (
    <div className={`${className}`}>
      <div className={`flex items-center gap-2 mb-2 text-sm font-medium ${colorClass}`}>
        <Clock className="w-4 h-4" />
        <span>เวลาที่เหลือของประกาศ</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Days */}
        <div className={`flex flex-col items-center px-3 py-2 rounded-lg ${isUrgent ? "bg-red-50 border border-red-200" : isWarning ? "bg-amber-50 border border-amber-200" : "bg-muted border border-border"}`}>
          <span className={`text-xl font-bold tabular-nums leading-none ${colorClass}`}>
            {String(timeLeft.days).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">วัน</span>
        </div>
        <span className={`text-lg font-bold ${colorClass}`}>:</span>
        {/* Hours */}
        <div className={`flex flex-col items-center px-3 py-2 rounded-lg ${isUrgent ? "bg-red-50 border border-red-200" : isWarning ? "bg-amber-50 border border-amber-200" : "bg-muted border border-border"}`}>
          <span className={`text-xl font-bold tabular-nums leading-none ${colorClass}`}>
            {String(timeLeft.hours).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">ชม.</span>
        </div>
        <span className={`text-lg font-bold ${colorClass}`}>:</span>
        {/* Minutes */}
        <div className={`flex flex-col items-center px-3 py-2 rounded-lg ${isUrgent ? "bg-red-50 border border-red-200" : isWarning ? "bg-amber-50 border border-amber-200" : "bg-muted border border-border"}`}>
          <span className={`text-xl font-bold tabular-nums leading-none ${colorClass}`}>
            {String(timeLeft.minutes).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">นาที</span>
        </div>
        <span className={`text-lg font-bold ${colorClass}`}>:</span>
        {/* Seconds */}
        <div className={`flex flex-col items-center px-3 py-2 rounded-lg ${isUrgent ? "bg-red-50 border border-red-200" : isWarning ? "bg-amber-50 border border-amber-200" : "bg-muted border border-border"}`}>
          <span className={`text-xl font-bold tabular-nums leading-none ${colorClass}`}>
            {String(timeLeft.seconds).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">วินาที</span>
        </div>
      </div>
      {isWarning && !isUrgent && (
        <p className="text-xs text-amber-600 mt-2">ประกาศนี้ใกล้หมดอายุแล้ว กรุณาต่ออายุเพื่อให้สินค้ายังแสดงอยู่</p>
      )}
      {isUrgent && (
        <p className="text-xs text-red-500 mt-2 font-medium">ประกาศนี้จะหมดอายุเร็วๆ นี้! กรุณาต่ออายุทันที</p>
      )}
    </div>
  );
}
