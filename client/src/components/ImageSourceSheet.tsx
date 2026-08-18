import { Camera, ImageIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { deviceOffersCameraCapture } from "@/lib/imageSource";

/** Keep inputs in the DOM without display:none — iOS ignores programmatic clicks on hidden file inputs. */
const HIDDEN_FILE_INPUT =
  "pointer-events-none fixed left-0 top-0 h-px w-px opacity-0";

type ImageSourceSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  title?: string;
  description?: string;
};

export function ImageSourceSheet({
  open,
  onOpenChange,
  onFiles,
  multiple = false,
  title = "เพิ่มรูปภาพ",
  description = "ถ่ายรูปด้วยกล้อง หรือเลือกจากคลังรูป",
}: ImageSourceSheetProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function emitFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    onFiles(Array.from(fileList));
    onOpenChange(false);
  }

  function openCamera() {
    cameraInputRef.current?.click();
  }

  function openGallery() {
    galleryInputRef.current?.click();
  }

  return (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={HIDDEN_FILE_INPUT}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          emitFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className={HIDDEN_FILE_INPUT}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          emitFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="z-[70] max-w-lg mx-auto">
          <DrawerHeader className="pb-2">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div
            className="px-4 space-y-2"
            style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              onClick={openCamera}
              className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
            >
              <span className="w-11 h-11 rounded-full bg-orange-600 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5 text-white" />
              </span>
              <span>
                <span className="block text-sm font-bold">ถ่ายรูป</span>
                <span className="block text-xs text-muted-foreground">เปิดกล้องหลังของโทรศัพท์</span>
              </span>
            </button>
            <button
              type="button"
              onClick={openGallery}
              className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
            >
              <span className="w-11 h-11 rounded-full bg-muted flex items-center justify-center shrink-0">
                <ImageIcon className="w-5 h-5 text-foreground" />
              </span>
              <span>
                <span className="block text-sm font-bold">เลือกจากคลัง</span>
                <span className="block text-xs text-muted-foreground">เลือกรูปที่มีอยู่แล้ว</span>
              </span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

type ImageSourcePickerProps = {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  title?: string;
  description?: string;
  children: (openPicker: () => void) => ReactNode;
};

/** Mobile: camera/gallery sheet. Desktop: native file picker. */
export function ImageSourcePicker({
  onFiles,
  multiple,
  disabled,
  title,
  description,
  children,
}: ImageSourcePickerProps) {
  const [open, setOpen] = useState(false);
  const galleryFallbackRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    if (disabled) return;
    if (deviceOffersCameraCapture()) {
      setOpen(true);
      return;
    }
    galleryFallbackRef.current?.click();
  }

  return (
    <>
      {children(openPicker)}
      <input
        ref={galleryFallbackRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className={HIDDEN_FILE_INPUT}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <ImageSourceSheet
        open={open}
        onOpenChange={setOpen}
        onFiles={onFiles}
        multiple={multiple}
        title={title}
        description={description}
      />
    </>
  );
}
