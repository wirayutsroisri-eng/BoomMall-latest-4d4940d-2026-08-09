import { type ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { ImageUploadError } from "@/lib/imageUpload";
import { ImageSourcePicker } from "@/components/ImageSourceSheet";
import {
  SELL_PHOTOS_EVENT,
  stashPendingSellImages,
} from "@/lib/sellPhotos";
import { SELL_PENDING_IMAGES_KEY } from "@shared/sell-photos";

type SellPhotoEntryProps = {
  children: (openPicker: () => void, busy: boolean) => ReactNode;
};

/** Old /sell form-first entry is replaced by pick photos, then continue to the listing form. */
export function SellPhotoEntry({ children }: SellPhotoEntryProps) {
  const { isAuthenticated, user } = useAuth();
  const [location] = useLocation();
  const [busy, setBusy] = useState(false);

  async function onFiles(files: File[]) {
    if (!files.length) return;
    if (location.startsWith("/sell")) {
      window.dispatchEvent(
        new CustomEvent(SELL_PHOTOS_EVENT, { detail: { files } })
      );
      return;
    }
    setBusy(true);
    try {
      await stashPendingSellImages(files);
      window.location.assign("/sell");
    } catch (err) {
      toast.error(err instanceof ImageUploadError ? err.message : "อ่านรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ImageSourcePicker
      onFiles={(files) => void onFiles(files)}
      multiple
      disabled={busy}
      title="ลงขายด้วยรูปภาพ"
      description="ถ่ายรูปสินค้า หรือเลือกจากคลัง แล้วไปกรอกรายละเอียด"
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
          if (sessionStorage.getItem(SELL_PENDING_IMAGES_KEY)) {
            window.location.assign("/sell");
            return;
          }
          openPicker();
        }, busy)
      }
    </ImageSourcePicker>
  );
}
