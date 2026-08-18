import { type ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { SellMediaPicker } from "@/components/SellMediaSheet";
import {
  SELL_MEDIA_EVENT,
  hasPendingSellMedia,
  stashPendingSellMedia,
  SellMediaError,
} from "@/lib/sellMedia";
import { ImageUploadError } from "@/lib/imageUpload";

type SellPhotoEntryProps = {
  children: (openPicker: () => void, busy: boolean) => ReactNode;
};

export function SellPhotoEntry({ children }: SellPhotoEntryProps) {
  const { isAuthenticated, user } = useAuth();
  const [location] = useLocation();
  const [busy, setBusy] = useState(false);

  async function onFiles(files: File[]) {
    if (!files.length) return;
    if (location.startsWith("/sell")) {
      window.dispatchEvent(
        new CustomEvent(SELL_MEDIA_EVENT, { detail: { files } })
      );
      return;
    }
    setBusy(true);
    try {
      await stashPendingSellMedia(files);
      window.location.assign("/sell");
    } catch (err) {
      toast.error(
        err instanceof SellMediaError || err instanceof ImageUploadError
          ? err.message
          : "อ่านไฟล์ไม่สำเร็จ"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SellMediaPicker
      onFiles={(files) => void onFiles(files)}
      disabled={busy}
      title="ลงรูปภาพและวิดีโอ"
      description="ถ่ายหรือเลือกรูปและวิดีโอ แล้วไปกรอกรายละเอียด"
    >
      {(openPicker) =>
        children(() => {
          if (!isAuthenticated) {
            window.location.assign(getLoginUrl());
            return;
          }
          if ((user as { kycStatus?: string } | null)?.kycStatus !== "approved") {
            window.location.assign("/kyc");
            return;
          }
          if (hasPendingSellMedia(sessionStorage)) {
            window.location.assign("/sell");
            return;
          }
          openPicker();
        }, busy)
      }
    </SellMediaPicker>
  );
}
