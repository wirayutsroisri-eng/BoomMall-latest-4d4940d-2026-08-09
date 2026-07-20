import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePushNotification } from "@/hooks/usePushNotification";
import { isDevBypassEnabled } from "@/devBypass";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Auto-prompt component that shows a notification banner after login
 * if the user hasn't subscribed to push notifications yet.
 * 
 * Shows once per session — if dismissed, won't show again until next session.
 */
export function PushNotificationPrompt() {
  const bypass = isDevBypassEnabled();
  const { isAuthenticated } = useAuth();
  const { isSubscribed, isSupported, subscribe, permissionState } = usePushNotification();
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (bypass) return;
    // Only show if:
    // 1. User is authenticated
    // 2. Push is supported
    // 3. Not already subscribed
    // 4. Not dismissed this session
    // 5. Permission not denied
    // 6. Hasn't been shown before in this session
    if (
      isAuthenticated &&
      isSupported &&
      !isSubscribed &&
      !dismissed &&
      permissionState !== "denied"
    ) {
      // Delay showing by 3 seconds after login to not be intrusive
      const timer = setTimeout(() => {
        // Check sessionStorage to avoid showing multiple times per session
        const alreadyShown = sessionStorage.getItem("push_prompt_shown");
        if (!alreadyShown) {
          setShow(true);
          sessionStorage.setItem("push_prompt_shown", "1");
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [bypass, isAuthenticated, isSupported, isSubscribed, dismissed, permissionState]);

  if (bypass || !show) return null;

  const handleSubscribe = async () => {
    const success = await subscribe();
    if (success) {
      setShow(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShow(false);
  };

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="bg-white border border-orange-200 rounded-xl shadow-lg p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
          <Bell className="w-5 h-5 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            เปิดการแจ้งเตือน
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            รับแจ้งเตือนเมื่อมีข้อความใหม่หรือสถานะออเดอร์เปลี่ยน
          </p>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              className="h-7 text-xs bg-orange-500 hover:bg-orange-600"
              onClick={handleSubscribe}
            >
              เปิดแจ้งเตือน
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-gray-500"
              onClick={handleDismiss}
            >
              ไว้ทีหลัง
            </Button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
