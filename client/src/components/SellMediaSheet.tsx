import { Camera, ImageIcon, Clapperboard } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { deviceOffersCameraCapture } from "@/lib/imageSource";

const HIDDEN_FILE_INPUT =
  "pointer-events-none fixed left-0 top-0 h-px w-px opacity-0";

type SellMediaSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFiles: (files: File[]) => void;
  title?: string;
  description?: string;
};

function MediaOption({
  icon,
  iconClassName,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
    >
      <span
        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${iconClassName}`}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

export function SellMediaSheet({
  open,
  onOpenChange,
  onFiles,
  title = "ลงรูปภาพและวิดีโอ",
  description = "ถ่ายหรือเลือกจากคลัง แล้วไปกรอกรายละเอียด",
}: SellMediaSheetProps) {
  const photoCameraRef = useRef<HTMLInputElement>(null);
  const mixedGalleryRef = useRef<HTMLInputElement>(null);
  const videoCameraRef = useRef<HTMLInputElement>(null);

  function emitFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    onFiles(Array.from(fileList));
    onOpenChange(false);
  }

  return (
    <>
      <input
        ref={photoCameraRef}
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
        ref={mixedGalleryRef}
        type="file"
        multiple
        className={HIDDEN_FILE_INPUT}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          emitFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={videoCameraRef}
        type="file"
        accept="video/*"
        capture="environment"
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
            <MediaOption
              icon={<Camera className="w-5 h-5 text-white" />}
              iconClassName="bg-orange-600"
              title="ถ่ายรูป"
              subtitle="เปิดกล้องถ่ายรูปสินค้า"
              onClick={() => photoCameraRef.current?.click()}
            />
            <MediaOption
              icon={<ImageIcon className="w-5 h-5 text-foreground" />}
              iconClassName="bg-muted"
              title="เลือกจากคลัง"
              subtitle="เปิดคลังรวมให้เห็นรูปและวิดีโอด้วยกัน"
              onClick={() => mixedGalleryRef.current?.click()}
            />
            <MediaOption
              icon={<Clapperboard className="w-5 h-5 text-white" />}
              iconClassName="bg-violet-600"
              title="ถ่ายวิดีโอ"
              subtitle="บันทึกคลิปสินค้าด้วยกล้อง"
              onClick={() => videoCameraRef.current?.click()}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

type SellMediaPickerProps = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  title?: string;
  description?: string;
  children: (openPicker: () => void) => ReactNode;
};

/** Mobile: photo + video sheet. Desktop: native file picker for both. */
export function SellMediaPicker({
  onFiles,
  disabled,
  title,
  description,
  children,
}: SellMediaPickerProps) {
  const [open, setOpen] = useState(false);
  const fallbackRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    if (disabled) return;
    if (deviceOffersCameraCapture()) {
      setOpen(true);
      return;
    }
    fallbackRef.current?.click();
  }

  return (
    <>
      {children(openPicker)}
      <input
        ref={fallbackRef}
        type="file"
        multiple
        className={HIDDEN_FILE_INPUT}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <SellMediaSheet
        open={open}
        onOpenChange={setOpen}
        onFiles={onFiles}
        title={title}
        description={description}
      />
    </>
  );
}
