import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export type PushPermissionState = "default" | "granted" | "denied" | "unsupported";

export function usePushNotification() {
  const [permissionState, setPermissionState] = useState<PushPermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { data: vapidData } = trpc.push.getVapidPublicKey.useQuery();
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermissionState("unsupported");
      return;
    }
    setPermissionState(Notification.permission as PushPermissionState);

    // Check current subscription
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!vapidData?.publicKey) {
      toast.error("ไม่สามารถเปิดใช้การแจ้งเตือนได้");
      return false;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      toast.error("เบราว์เซอร์ไม่รองรับการแจ้งเตือน");
      return false;
    }

    setIsLoading(true);
    try {
      // Request permission
      const permission = await Notification.requestPermission();
      setPermissionState(permission as PushPermissionState);

      if (permission !== "granted") {
        toast.error("กรุณาอนุญาตการแจ้งเตือนในการตั้งค่าเบราว์เซอร์");
        return false;
      }

      // Register service worker and subscribe
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
      });

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error("Invalid subscription");
      }

      await subscribeMutation.mutateAsync({
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
      });

      setIsSubscribed(true);
      toast.success("เปิดใช้การแจ้งเตือนสำเร็จ! 🔔");
      return true;
    } catch (err: any) {
      console.error("[Push] Subscribe error:", err);
      toast.error("ไม่สามารถเปิดใช้การแจ้งเตือนได้: " + (err.message ?? ""));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [vapidData, subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeMutation.mutateAsync({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      toast.success("ปิดการแจ้งเตือนแล้ว");
    } catch (err: any) {
      console.error("[Push] Unsubscribe error:", err);
      toast.error("เกิดข้อผิดพลาด");
    } finally {
      setIsLoading(false);
    }
  }, [unsubscribeMutation]);

  return {
    permissionState,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    isSupported: permissionState !== "unsupported",
  };
}
