import { useCallback, useMemo, useRef, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cropImageFile } from "@/lib/imageCrop";

type AspectOption = "1:1" | "9:16";

type OpenImageEditorOptions = {
  title?: string;
  description?: string;
  aspectOptions?: AspectOption[];
  initialAspect?: AspectOption;
};

type ModalState = {
  file: File;
  title: string;
  description: string;
  aspectOptions: AspectOption[];
  initialAspect: AspectOption;
};

const ASPECT_RATIO_MAP: Record<AspectOption, number> = {
  "1:1": 1,
  "9:16": 9 / 16,
};

const DEFAULT_OPTIONS: Required<OpenImageEditorOptions> = {
  title: "แต่งรูปก่อนอัปโหลด",
  description: "ครอป หมุน และเลือกอัตราส่วนภาพก่อนอัปโหลดไฟล์",
  aspectOptions: ["1:1", "9:16"],
  initialAspect: "1:1",
};

export function useImageEditorModal() {
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [selectedAspect, setSelectedAspect] = useState<AspectOption>(
    DEFAULT_OPTIONS.initialAspect
  );
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const resolverRef = useRef<((value: File | null) => void) | null>(null);
  const imageUrlRef = useRef<string | null>(null);

  const closeModal = useCallback((result: File | null) => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }

    setModalState(null);
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    setIsSaving(false);

    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  }, []);

  const openImageEditor = useCallback(
    (file: File, options?: OpenImageEditorOptions) => {
      if (file.type === "image/gif") {
        return Promise.resolve(file);
      }

      const mergedOptions = {
        ...DEFAULT_OPTIONS,
        ...options,
      };

      const initialAspect =
        mergedOptions.aspectOptions.find(
          (option) => option === mergedOptions.initialAspect
        ) ?? mergedOptions.aspectOptions[0] ?? DEFAULT_OPTIONS.initialAspect;

      const objectUrl = URL.createObjectURL(file);
      imageUrlRef.current = objectUrl;
      setImageSrc(objectUrl);
      setSelectedAspect(initialAspect);
      setModalState({
        file,
        title: mergedOptions.title,
        description: mergedOptions.description,
        aspectOptions: mergedOptions.aspectOptions,
        initialAspect,
      });

      return new Promise<File | null>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    []
  );

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = useCallback(async () => {
    if (!modalState || !croppedAreaPixels) return;

    setIsSaving(true);
    try {
      const editedFile = await cropImageFile(
        modalState.file,
        croppedAreaPixels,
        rotation
      );
      closeModal(editedFile);
    } catch (error) {
      setIsSaving(false);
      throw error;
    }
  }, [closeModal, croppedAreaPixels, modalState, rotation]);

  const modal = useMemo(
    () => (
      <Dialog
        open={!!modalState}
        onOpenChange={(open) => {
          if (!open && modalState) closeModal(null);
        }}
      >
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{modalState?.title ?? DEFAULT_OPTIONS.title}</DialogTitle>
            <DialogDescription>
              {modalState?.description ?? DEFAULT_OPTIONS.description}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6">
            <div className="relative h-[50vh] min-h-[320px] overflow-hidden rounded-xl bg-black">
              {imageSrc && modalState ? (
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={ASPECT_RATIO_MAP[selectedAspect]}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onCropComplete={onCropComplete}
                  showGrid
                />
              ) : null}
            </div>
          </div>

          <div className="space-y-5 px-6 pb-6">
            <div className="space-y-2">
              <p className="text-sm font-medium">อัตราส่วนภาพ</p>
              <ToggleGroup
                type="single"
                value={selectedAspect}
                onValueChange={(value) => {
                  if (value) setSelectedAspect(value as AspectOption);
                }}
                variant="outline"
                className="w-full"
              >
                {(modalState?.aspectOptions ?? DEFAULT_OPTIONS.aspectOptions).map(
                  (option) => (
                    <ToggleGroupItem key={option} value={option} className="flex-1">
                      {option}
                    </ToggleGroupItem>
                  )
                )}
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">ซูม</span>
                <span className="text-muted-foreground">
                  {zoom.toFixed(1)}x
                </span>
              </div>
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.1}
                onValueChange={(value) => setZoom(value[0] ?? 1)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <RotateCw className="h-4 w-4" />
                  หมุนภาพ
                </span>
                <span className="text-muted-foreground">
                  {Math.round(rotation)}°
                </span>
              </div>
              <Slider
                value={[rotation]}
                min={-180}
                max={180}
                step={1}
                onValueChange={(value) => setRotation(value[0] ?? 0)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => closeModal(null)}
                disabled={isSaving}
              >
                ยกเลิก
              </Button>
              <Button type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "กำลังบันทึก..." : "ใช้รูปนี้"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    ),
    [
      closeModal,
      crop,
      handleSave,
      imageSrc,
      isSaving,
      modalState,
      onCropComplete,
      rotation,
      selectedAspect,
      zoom,
    ]
  );

  return {
    openImageEditor,
    imageEditorModal: modal,
  };
}
