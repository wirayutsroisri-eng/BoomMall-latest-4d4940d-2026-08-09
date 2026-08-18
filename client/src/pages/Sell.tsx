import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, Upload, Video, X, Truck, Wallet, Package, CreditCard, QrCode, Camera } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link, useSearch } from "wouter";
import { LISTING_TYPE_LABELS } from "@shared/types";
import { normalizeWholesalePriceTiers, WholesalePriceTierError } from "@shared/wholesale-pricing";
import { MAX_VIDEO_UPLOAD_BYTES, formatUploadLimit } from "@shared/upload-limits";
import { fileToBase64Raw, prepareImageForUpload, ImageUploadError } from "@/lib/imageUpload";
import { ImageSourcePicker, ImageSourceSheet } from "@/components/ImageSourceSheet";
import { SELL_PHOTOS_EVENT, takePendingSellImages, type PendingSellImage } from "@/lib/sellPhotos";

export default function SellPage() {
  const { user, isAuthenticated } = useAuth();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const editId = params.get("edit") ? parseInt(params.get("edit")!) : undefined;
  const isEditMode = !!editId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<"new" | "like_new" | "good" | "fair" | "poor">("good");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [location, setLocation] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [productStatus, setProductStatus] = useState<"active" | "hidden">("active");
  const [quantity, setQuantity] = useState<number>(1);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  // Contact info (per-product override)
  const [contactPhone, setContactPhone] = useState("");
  const [contactLineId, setContactLineId] = useState("");
  const [contactFacebookUrl, setContactFacebookUrl] = useState("");
  // Shipping & payment
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [allowCod, setAllowCod] = useState(false);
  const [allowWallet, setAllowWallet] = useState(false);
  const [allowPromptpay, setAllowPromptpay] = useState(false);
  const [deliveryDays, setDeliveryDays] = useState<number>(3);
  // Payment details
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [promptpayNumber, setPromptpayNumber] = useState("");
  const [promptpayQrUrl, setPromptpayQrUrl] = useState<string | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);
  // Pricing extras
  const [conditionPercent, setConditionPercent] = useState<string>("");
  const [originalPrice, setOriginalPrice] = useState<string>("");
  const [salePrice, setSalePrice] = useState<string>("");
  const [retailPrice, setRetailPrice] = useState<string>("");
  const [priceTiers, setPriceTiers] = useState<{ minQty: number; pricePerUnit: number }[]>([]);
  const [listingType, setListingType] = useState<"c2c" | "b2b" | "both">("both");

  const DRAFT_KEY = "boommall_sell_draft";
  const startedPhotoFlow = useRef(false);
  const [pendingToUpload, setPendingToUpload] = useState<PendingSellImage[] | null>(null);

  // Restore draft, then continue the photo-first listing flow.
  useEffect(() => {
    if (isEditMode || startedPhotoFlow.current) return;
    if (!isAuthenticated) return;
    if (user?.kycStatus !== "approved") return;
    startedPhotoFlow.current = true;

    const pending = takePendingSellImages();
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.title) setTitle(d.title);
        if (d.description) setDescription(d.description);
        if (d.price) setPrice(d.price);
        if (d.condition) setCondition(d.condition);
        if (d.categoryId) setCategoryId(d.categoryId);
        if (d.location) setLocation(d.location);
        if (!pending.length && d.images?.length) setImages(d.images);
        if (d.quantity) setQuantity(d.quantity);
        if (d.videoUrl) setVideoUrl(d.videoUrl);
        if (d.contactPhone) setContactPhone(d.contactPhone);
        if (d.contactLineId) setContactLineId(d.contactLineId);
        if (d.contactFacebookUrl) setContactFacebookUrl(d.contactFacebookUrl);
        if (typeof d.shippingFee === "number") setShippingFee(d.shippingFee);
        if (typeof d.allowCod === "boolean") setAllowCod(d.allowCod);
        if (typeof d.allowWallet === "boolean") setAllowWallet(d.allowWallet);
        if (typeof d.allowPromptpay === "boolean") setAllowPromptpay(d.allowPromptpay);
        if (d.deliveryDays) setDeliveryDays(d.deliveryDays);
        if (d.bankName) setBankName(d.bankName);
        if (d.bankAccountNumber) setBankAccountNumber(d.bankAccountNumber);
        if (d.bankAccountName) setBankAccountName(d.bankAccountName);
        if (d.promptpayNumber) setPromptpayNumber(d.promptpayNumber);
        if (d.promptpayQrUrl) setPromptpayQrUrl(d.promptpayQrUrl);
      }
    } catch {}

    if (pending.length) {
      setPendingToUpload(pending);
      return;
    }

    let draftHasImages = false;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      const d = saved ? JSON.parse(saved) : {};
      draftHasImages = Array.isArray(d.images) && d.images.length > 0;
    } catch {}
    if (!draftHasImages) setPhotoPickerOpen(true);
  }, [isEditMode, isAuthenticated, user?.kycStatus]);

  // Auto-save draft to localStorage whenever form changes (new listing only)
  useEffect(() => {
    if (isEditMode) return;
    const draft = {
      title, description, price, condition, categoryId, location, images,
      quantity, videoUrl, contactPhone, contactLineId, contactFacebookUrl,
      shippingFee, allowCod, allowWallet, allowPromptpay, deliveryDays,
      bankName, bankAccountNumber, bankAccountName, promptpayNumber, promptpayQrUrl,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [
    isEditMode, title, description, price, condition, categoryId, location, images,
    quantity, videoUrl, contactPhone, contactLineId, contactFacebookUrl,
    shippingFee, allowCod, allowWallet, allowPromptpay, deliveryDays,
    bankName, bankAccountNumber, bankAccountName, promptpayNumber, promptpayQrUrl,
  ]);

  const { data: categories } = trpc.products.categories.useQuery();
  const { data: paymentDefaults } = trpc.kyc.getPaymentDefaults.useQuery(
    undefined,
    { enabled: isAuthenticated && !isEditMode }
  );
  const { data: existingProduct } = trpc.products.getById.useQuery(
    { id: editId ?? 0 },
    { enabled: isEditMode && !!editId }
  );

  // Auto-fill payment defaults for new listings
  useEffect(() => {
    if (!isEditMode && paymentDefaults) {
      if (paymentDefaults.bankName) setBankName(paymentDefaults.bankName);
      if (paymentDefaults.bankAccountNumber) setBankAccountNumber(paymentDefaults.bankAccountNumber);
      if (paymentDefaults.bankAccountName) setBankAccountName(paymentDefaults.bankAccountName);
      if (paymentDefaults.promptpayNumber) setPromptpayNumber(paymentDefaults.promptpayNumber);
      if (paymentDefaults.defaultPromptpayQrUrl) setPromptpayQrUrl(paymentDefaults.defaultPromptpayQrUrl);
    }
  }, [paymentDefaults, isEditMode]);

  // Populate form when editing
  useEffect(() => {
    if (existingProduct && isEditMode) {
      setTitle(existingProduct.title);
      setDescription(existingProduct.description ?? "");
      setPrice(existingProduct.price.toString());
      setCondition(existingProduct.condition);
      setCategoryId(existingProduct.categoryId ?? undefined);
      setLocation(existingProduct.location ?? "");
      setImages((existingProduct.images as string[]) ?? []);
      setProductStatus(existingProduct.status === "hidden" ? "hidden" : "active");
      setQuantity((existingProduct as any).quantity ?? 1);
      setContactPhone((existingProduct as any).contactPhone ?? "");
      setContactLineId((existingProduct as any).contactLineId ?? "");
      setContactFacebookUrl((existingProduct as any).contactFacebookUrl ?? "");
      setShippingFee(parseFloat((existingProduct as any).shippingFee ?? "0") || 0);
      setAllowCod((existingProduct as any).allowCod ?? false);
      setAllowWallet((existingProduct as any).allowWallet ?? false);
      setAllowPromptpay((existingProduct as any).allowPromptpay ?? false);
      setDeliveryDays((existingProduct as any).deliveryDays ?? 3);
      setBankName((existingProduct as any).bankName ?? "");
      setBankAccountNumber((existingProduct as any).bankAccountNumber ?? "");
      setBankAccountName((existingProduct as any).bankAccountName ?? "");
      setPromptpayNumber((existingProduct as any).promptpayNumber ?? "");
      setPromptpayQrUrl((existingProduct as any).promptpayQrUrl ?? null);
      const cp = (existingProduct as any).conditionPercent;
      setConditionPercent(cp !== null && cp !== undefined ? String(cp) : "");
      setOriginalPrice((existingProduct as any).originalPrice ? String(parseFloat((existingProduct as any).originalPrice)) : "");
      setSalePrice((existingProduct as any).salePrice ? String(parseFloat((existingProduct as any).salePrice)) : "");
      setRetailPrice((existingProduct as any).retailPrice ? String(parseFloat((existingProduct as any).retailPrice)) : "");
      setPriceTiers((existingProduct as any).priceTiers ?? []);
      setListingType((existingProduct as any).listingType ?? "both");
    }
  }, [existingProduct, isEditMode]);

  const uploadImage = trpc.products.uploadImage.useMutation();
  const uploadVideo = trpc.products.uploadVideo.useMutation();
  const uploadQrCode = trpc.products.uploadImage.useMutation();
  const createProduct = trpc.products.create.useMutation({
    onSuccess: () => {
      localStorage.removeItem(DRAFT_KEY);
      toast.success("ลงประกาศสำเร็จ! สินค้าของคุณอยู่ระหว่างรอ Admin อนุมัติ");
      window.location.href = `/seller/dashboard`;
    },
    onError: (err) => toast.error(err.message),
  });
  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => {
      toast.success("อัปเดตสินค้าสำเร็จ!");
      window.location.href = `/products/${editId}`;
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleVideoUpload(file: File) {
    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      toast.error(`วีดีโอขนาดเกิน ${formatUploadLimit(MAX_VIDEO_UPLOAD_BYTES)}`);
      return;
    }
    setUploadingVideo(true);
    try {
      const base64 = await fileToBase64Raw(file);
      const result = await uploadVideo.mutateAsync({
        filename: file.name,
        contentType: file.type,
        base64,
      });
      setVideoUrl(result.url);
      toast.success("อัปโหลดวีดีโอสำเร็จ");
    } catch {
      toast.error("อัปโหลดวีดีโอล้มเหลว");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleImageUpload(files: File[] | FileList) {
    setUploadingImages(true);
    try {
      for (const file of Array.from(files)) {
        try {
          const prepared = await prepareImageForUpload(file);
          const result = await uploadImage.mutateAsync({
            filename: prepared.filename,
            contentType: prepared.contentType,
            base64: prepared.base64,
          });
          setImages((prev) => [...prev, result.url]);
        } catch (err) {
          const message =
            err instanceof ImageUploadError
              ? err.message
              : `${file.name} อัปโหลดไม่สำเร็จ`;
          toast.error(message);
        }
      }
    } catch {
      toast.error("อัปโหลดรูปภาพล้มเหลว");
    } finally {
      setUploadingImages(false);
    }
  }

  const handleImageUploadRef = useRef(handleImageUpload);
  handleImageUploadRef.current = handleImageUpload;

  useEffect(() => {
    function onPhotos(event: Event) {
      const files = (event as CustomEvent<{ files: File[] }>).detail?.files;
      if (files?.length) void handleImageUploadRef.current(files);
    }
    window.addEventListener(SELL_PHOTOS_EVENT, onPhotos);
    return () => window.removeEventListener(SELL_PHOTOS_EVENT, onPhotos);
  }, []);

  useEffect(() => {
    if (!pendingToUpload?.length) return;
    const items = pendingToUpload;
    setPendingToUpload(null);
    setUploadingImages(true);
    void (async () => {
      try {
        for (const item of items) {
          const result = await uploadImage.mutateAsync({
            filename: item.filename,
            contentType: item.contentType,
            base64: item.base64,
          });
          setImages((prev) => [...prev, result.url]);
        }
      } catch {
        toast.error("อัปโหลดรูปภาพล้มเหลว");
      } finally {
        setUploadingImages(false);
      }
    })();
  }, [pendingToUpload, uploadImage]);

  function handleSubmit() {
    const basePrice = parseFloat(price);
    if (priceTiers.length > 0) {
      try {
        normalizeWholesalePriceTiers(basePrice, priceTiers);
      } catch (err) {
        if (err instanceof WholesalePriceTierError) {
          toast.error(err.message);
          return;
        }
      }
    }

    if (isEditMode && editId) {
      updateProduct.mutate({
        id: editId,
        title,
        description: description || undefined,
        price: parseFloat(price),
        condition,
        categoryId,
        images,
        location: location || undefined,
        status: productStatus,
        quantity,
        contactPhone: contactPhone || undefined,
        contactLineId: contactLineId || undefined,
        contactFacebookUrl: contactFacebookUrl || undefined,
        shippingFee,
        allowCod,
        allowWallet,
        allowPromptpay,
        bankName: bankName || undefined,
        bankAccountNumber: bankAccountNumber || undefined,
        bankAccountName: bankAccountName || undefined,
        promptpayNumber: promptpayNumber || undefined,
        promptpayQrUrl: promptpayQrUrl || undefined,
        deliveryDays,
        conditionPercent: conditionPercent !== "" ? parseInt(conditionPercent) : undefined,
        originalPrice: originalPrice !== "" ? parseFloat(originalPrice) : undefined,
        salePrice: salePrice !== "" ? parseFloat(salePrice) : undefined,
        retailPrice: retailPrice !== "" ? parseFloat(retailPrice) : undefined,
        priceTiers: priceTiers.length > 0 ? priceTiers : undefined,
        listingType,
      });
    } else {
      createProduct.mutate({
        title,
        description: description || undefined,
        price: parseFloat(price),
        condition,
        categoryId,
        images,
        location: location || undefined,
        videoUrl: videoUrl || undefined,
        quantity,
        contactPhone: contactPhone || undefined,
        contactLineId: contactLineId || undefined,
        contactFacebookUrl: contactFacebookUrl || undefined,
        shippingFee,
        allowCod,
        allowWallet,
        allowPromptpay,
        bankName: bankName || undefined,
        bankAccountNumber: bankAccountNumber || undefined,
        bankAccountName: bankAccountName || undefined,
        promptpayNumber: promptpayNumber || undefined,
        promptpayQrUrl: promptpayQrUrl || undefined,
        deliveryDays,
        conditionPercent: conditionPercent !== "" ? parseInt(conditionPercent) : undefined,
        originalPrice: originalPrice !== "" ? parseFloat(originalPrice) : undefined,
        salePrice: salePrice !== "" ? parseFloat(salePrice) : undefined,
        retailPrice: retailPrice !== "" ? parseFloat(retailPrice) : undefined,
        priceTiers: priceTiers.length > 0 ? priceTiers : undefined,
        listingType,
      });
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="container py-16 text-center">
        <h2 className="text-xl font-semibold mb-4">กรุณาเข้าสู่ระบบ</h2>
        <Link href="/"><Button>กลับหน้าหลัก</Button></Link>
      </div>
    );
  }

  if (user?.kycStatus !== "approved") {
    return (
      <div className="container py-16 max-w-md mx-auto text-center">
        <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-primary/30" />
        <h2 className="text-xl font-bold mb-2">ยืนยันตัวตนก่อนลงขาย</h2>
        <p className="text-muted-foreground mb-6">
          คุณต้องยืนยันตัวตน (KYC) ก่อนจึงจะสามารถลงขายสินค้าได้
        </p>
        <Link href="/kyc">
          <Button>ยืนยันตัวตนตอนนี้</Button>
        </Link>
      </div>
    );
  }

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "Prompt, sans-serif" }}>
          {isEditMode ? "แก้ไขสินค้า" : "ลงขายด้วยรูปภาพ"}
        </h1>
        {!isEditMode && (
          <p className="text-sm text-muted-foreground mb-6">ถ่ายรูปหรือเลือกจากคลังก่อน แล้วค่อยกรอกรายละเอียด</p>
        )}

        <div className="space-y-6">
          {/* Images first — photo listing flow */}
          <Card className="border-orange-200">
            <CardHeader>
              <CardTitle className="text-base">รูปสินค้า *</CardTitle>
            </CardHeader>
            <CardContent>
              {images.length === 0 ? (
                <ImageSourcePicker
                  onFiles={(files) => void handleImageUpload(files)}
                  multiple
                  disabled={uploadingImages}
                  title="ลงขายด้วยรูปภาพ"
                  description="ถ่ายรูปสินค้า หรือเลือกจากคลัง"
                >
                  {(openPicker) => (
                    <button
                      type="button"
                      onClick={openPicker}
                      disabled={uploadingImages}
                      className="w-full min-h-48 rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50/70 flex flex-col items-center justify-center gap-3 text-orange-800 hover:bg-orange-50 transition-colors px-4 py-8"
                    >
                      <span className="w-16 h-16 rounded-full bg-orange-600 flex items-center justify-center shadow-md">
                        <Camera className="w-8 h-8 text-white" />
                      </span>
                      <span className="text-base font-bold">
                        {uploadingImages ? "กำลังอัปโหลดรูป..." : "ถ่ายรูปหรือเลือกรูปสินค้า"}
                      </span>
                      <span className="text-xs text-muted-foreground">สูงสุด 10 รูป · บีบอัดอัตโนมัติ</span>
                    </button>
                  )}
                </ImageSourcePicker>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-3">
                    {images.map((img, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                        {i === 0 && (
                          <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-white text-xs text-center py-0.5">
                            หลัก
                          </div>
                        )}
                      </div>
                    ))}
                    {images.length < 10 && (
                      <ImageSourcePicker
                        onFiles={(files) => void handleImageUpload(files)}
                        multiple
                        disabled={uploadingImages}
                        title="เพิ่มรูปสินค้า"
                        description="ถ่ายรูปสินค้า หรือเลือกจากคลัง"
                      >
                        {(openPicker) => (
                          <button
                            type="button"
                            onClick={openPicker}
                            disabled={uploadingImages}
                            className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Upload className="w-5 h-5" />
                            <span className="text-xs">{uploadingImages ? "กำลังอัปโหลด..." : "เพิ่มรูป"}</span>
                          </button>
                        )}
                      </ImageSourcePicker>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">อัปโหลดได้สูงสุด 10 รูป</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Video */}
          <Card>
            <CardHeader><CardTitle className="text-base">วีดีโอสินค้า (ไม่บังคับ)</CardTitle></CardHeader>
            <CardContent>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
              />
              {videoUrl ? (
                <div className="space-y-2">
                  <video src={videoUrl} controls className="w-full rounded-lg max-h-48" />
                  <Button variant="outline" size="sm" onClick={() => setVideoUrl(null)}>ลบวีดีโอ</Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={uploadingVideo}
                  className="w-full border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Video className="w-6 h-6" />
                  <span className="text-sm">{uploadingVideo ? "กำลังอัปโหลด..." : "อัปโหลดวีดีโอ (สูงสุด 50MB)"}</span>
                </button>
              )}
            </CardContent>
          </Card>

          {/* Listing Type — B2B / C2C */}
          <Card>
            <CardHeader><CardTitle className="text-base">ประเภทการขาย</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {(["c2c", "b2b", "both"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setListingType(type)}
                    className={`px-3 py-3 rounded-xl text-xs font-semibold border-2 transition-all ${
                      listingType === type
                        ? type === "b2b"
                          ? "border-red-500 bg-red-50 text-red-700"
                          : type === "c2c"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {LISTING_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                กำหนดว่าผู้ซื้อจะทักแชทแบบไหนได้ — มือสอง (C2C), ราคาส่ง (B2B), หรือทั้งสอง
              </p>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">รายละเอียดสินค้า</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>ชื่อสินค้า *</Label>
                <Input
                  placeholder="ระบุชื่อสินค้าให้ชัดเจน"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1"
                  maxLength={255}
                />
              </div>
              <div>
                <Label>รายละเอียด</Label>
                <Textarea
                  placeholder="อธิบายสินค้า สภาพ ข้อดี ข้อเสีย..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1"
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>ราคา (บาท) *</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    min={1}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>จำนวนชิ้น *</Label>
                  <Input
                    type="number"
                    placeholder="1"
                    min={1}
                    max={9999}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>สภาพสินค้า *</Label>
                  <Select value={condition} onValueChange={(v: any) => setCondition(v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">ใหม่</SelectItem>
                      <SelectItem value="like_new">เหมือนใหม่</SelectItem>
                      <SelectItem value="good">ดี</SelectItem>
                      <SelectItem value="fair">พอใช้</SelectItem>
                      <SelectItem value="poor">ต้องซ่อม</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>หมวดหมู่</Label>
                  <Select
                    value={categoryId?.toString() ?? ""}
                    onValueChange={(v) => setCategoryId(v ? parseInt(v) : undefined)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="เลือกหมวดหมู่" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>สถานที่</Label>
                  <Input
                    placeholder="กรุงเทพ, เชียงใหม่..."
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              {/* Condition Percent */}
              <div>
                <Label>สภาพสินค้า (%) <span className="text-muted-foreground font-normal text-xs">ไม่บังคับ</span></Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    placeholder="เช่น 90"
                    min={0}
                    max={100}
                    value={conditionPercent}
                    onChange={(e) => setConditionPercent(e.target.value)}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[100, 95, 90, 85, 80, 70].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setConditionPercent(String(v))}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        conditionPercent === String(v)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">ประเมินสภาพสินค้ามือสองเป็นเปอร์เซ็นต์</p>
              </div>

              {/* Pricing extras */}
              <div className="grid grid-cols-1 gap-4 p-4 rounded-lg bg-muted/30 border">
                <p className="text-sm font-medium">ราคาเปรียบเทียบ <span className="text-muted-foreground font-normal text-xs">(ไม่บังคับ)</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">ราคาเต็ม (ก่อนลด)</Label>
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        placeholder="0"
                        min={0}
                        value={originalPrice}
                        onChange={(e) => setOriginalPrice(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">แสดงขีดทับ ~~บาท~~</p>
                  </div>
                  <div>
                    <Label className="text-xs">ราคาโปรโมชั่น</Label>
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        placeholder="0"
                        min={0}
                        value={salePrice}
                        onChange={(e) => setSalePrice(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">ราคาที่ลดแล้ว</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">ราคามือหนึ่ง (เปรียบเทียบ)</Label>
                  <Input
                    type="number"
                    placeholder="ราคาสินค้าใหม่ในตลาด"
                    min={0}
                    value={retailPrice}
                    onChange={(e) => setRetailPrice(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">ราคาสินค้าใหม่ในตลาด ใช้เปรียบเทียบให้ผู้ซื้อเห็นความคุ้มค่า</p>
                </div>
              </div>

              {isEditMode && (
                <div>
                  <Label>สถานะสินค้า</Label>
                  <Select value={productStatus} onValueChange={(v: any) => setProductStatus(v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">แสดงสินค้า</SelectItem>
                      <SelectItem value="hidden">ซ่อนสินค้า</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipping & Payment Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Truck className="w-4 h-4" />การจัดส่งและการชำระเงิน</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>ระยะเวลาจัดส่ง (วัน)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={deliveryDays}
                    onChange={(e) => setDeliveryDays(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">วัน (1-30 วัน)</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[1, 2, 3, 5, 7].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDeliveryDays(d)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        deliveryDays === d
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {d} วัน
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">ระยะเวลาโดยประมาณในการจัดส่งสินค้า</p>
              </div>
              <div>
                <Label>ค่าขนส่ง (บาท)</Label>
                <Input
                  type="number"
                  placeholder="0 = ฟรีค่าขนส่ง"
                  min={0}
                  value={shippingFee}
                  onChange={(e) => setShippingFee(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">ใส่ 0 หากต้องการให้ฟรีค่าขนส่ง</p>
              </div>
              <div>
                <Label className="mb-2 block">วิธีชำระเงินที่รับ</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="w-4 h-4 accent-primary"
                    />
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      <div>
                        <div className="text-sm font-medium">โอนเงิน / PromptPay</div>
                        <div className="text-xs text-muted-foreground">รับเสมอ (ค่าเริ่มต้น)</div>
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={allowWallet}
                      onChange={(e) => setAllowWallet(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-blue-500" />
                      <div>
                        <div className="text-sm font-medium">Wallet</div>
                        <div className="text-xs text-muted-foreground">ผู้ซื้อชำระจาก Wallet ในแอป</div>
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={allowCod}
                      onChange={(e) => setAllowCod(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-orange-500" />
                      <div>
                        <div className="text-sm font-medium">เก็บเงินปลายทาง (COD)</div>
                        <div className="text-xs text-muted-foreground">รับเงินเมื่อส่งถึงมือผู้ซื้อ</div>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Methods Configuration Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" />ตั้งค่าวิธีรับเงิน</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">เลือกวิธีรับเงินและกรอกรายละเอียดบัญชี/QR Code PromptPay</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* PromptPay Checkbox */}
              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={allowPromptpay}
                  onChange={(e) => setAllowPromptpay(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-purple-500" />
                  <div>
                    <div className="text-sm font-medium">โอนเงิน / PromptPay</div>
                    <div className="text-xs text-muted-foreground">กรอกเลขบัญชีหรือ QR Code PromptPay</div>
                  </div>
                </div>
              </label>

              {/* Bank Details - Show when PromptPay is selected */}
              {allowPromptpay && (
                <div className="space-y-4 p-4 rounded-lg bg-muted/30 border">
                  <div>
                    <Label>ชื่อธนาคาร</Label>
                    <Input
                      placeholder="เช่น ธนาคารกรุงไทย"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>เลขบัญชี</Label>
                    <Input
                      placeholder="เช่น 1234567890"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>ชื่อบัญชี</Label>
                    <Input
                      placeholder="เช่น นาย สมชาย ใจดี"
                      value={bankAccountName}
                      onChange={(e) => setBankAccountName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>หมายเลขพร้อมเพย์ (เบอร์โทร/เลขบัตรประชาชน)</Label>
                    <Input
                      placeholder="เช่น 0812345678"
                      value={promptpayNumber}
                      onChange={(e) => setPromptpayNumber(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>QR Code PromptPay (ไม่บังคับ)</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => qrInputRef.current?.click()}
                        disabled={uploadingQr}
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        {uploadingQr ? "กำลังอัปโหลด..." : "อัปโหลด QR Code"}
                      </Button>
                      <input
                        ref={qrInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingQr(true);
                          try {
                            const prepared = await prepareImageForUpload(file);
                            const result = await uploadQrCode.mutateAsync({
                              filename: prepared.filename,
                              contentType: prepared.contentType,
                              base64: prepared.base64,
                            });
                            setPromptpayQrUrl(result.url);
                            toast.success("อัปโหลด QR Code สำเร็จ");
                          } catch (err) {
                            toast.error(
                              err instanceof ImageUploadError
                                ? err.message
                                : "อัปโหลด QR Code ล้มเหลว"
                            );
                          } finally {
                            setUploadingQr(false);
                          }
                        }}
                      />
                    </div>
                    {promptpayQrUrl && (
                      <div className="mt-2">
                        <div className="relative w-full rounded-lg border overflow-hidden bg-white" style={{ aspectRatio: "16/9" }}>
                          <img src={promptpayQrUrl} alt="QR Code" className="absolute inset-0 w-full h-full object-contain" />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPromptpayQrUrl(null)}
                          className="mt-1 text-xs"
                        >
                          ลบ QR Code
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contact Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ช่องทางติดต่อสำหรับสินค้านี้ (ไม่บังคับ)</CardTitle>
              <p className="text-sm text-muted-foreground">หากกรอก จะแสดงในหน้าสินค้านี้โดยเฉพาะ ถ้าไม่กรอกจะใช้ข้อมูลจากโปรไฟล์ของคุณ</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>เบอร์โทรศัพท์</Label>
                <Input
                  type="tel"
                  placeholder="เช่น 0812345678"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>LINE ID</Label>
                <Input
                  placeholder="เช่น @myshop หรือ mylineid"
                  value={contactLineId}
                  onChange={(e) => setContactLineId(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>ลิงก์ Facebook</Label>
                <Input
                  type="url"
                  placeholder="เช่น https://facebook.com/mypage"
                  value={contactFacebookUrl}
                  onChange={(e) => setContactFacebookUrl(e.target.value)}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Tier Pricing Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" />ราคาตามจำนวน <span className="text-muted-foreground font-normal text-xs">(ไม่บังคับ)</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">ตั้งราคาต่อชิ้นตามจำนวนที่ซื้อ เช่น ซื้อ 3 ชิ้นขึ้นไป ลดราคาเหลือ X บาท/ชิ้น</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {priceTiers.map((tier, idx) => (
                <div key={idx} className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">ซื้อตั้งแต่ (ชิ้น)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={tier.minQty === 0 ? "" : String(tier.minQty)}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "");
                          const updated = [...priceTiers];
                          updated[idx] = { ...updated[idx], minQty: val === "" ? 0 : parseInt(val) };
                          setPriceTiers(updated);
                        }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          const updated = [...priceTiers];
                          updated[idx] = { ...updated[idx], minQty: val < 1 ? 1 : val };
                          setPriceTiers(updated);
                        }}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">ราคา/ชิ้น (บาท)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        value={tier.pricePerUnit === 0 ? "" : String(tier.pricePerUnit)}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, "");
                          const updated = [...priceTiers];
                          updated[idx] = { ...updated[idx], pricePerUnit: val === "" ? 0 : parseFloat(val) || 0 };
                          setPriceTiers(updated);
                        }}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = [...priceTiers];
                          updated[idx] = { ...updated[idx], pricePerUnit: val };
                          setPriceTiers(updated);
                        }}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPriceTiers(priceTiers.filter((_, i) => i !== idx))}
                    className="p-1.5 rounded-full hover:bg-destructive/10 text-destructive transition-colors mt-4"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setPriceTiers([...priceTiers, { minQty: priceTiers.length > 0 ? (priceTiers[priceTiers.length - 1].minQty + 1) : 2, pricePerUnit: parseFloat(price) || 0 }])}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                เพิ่มราคาตามจำนวน
              </Button>
              {priceTiers.length > 0 && (
                <div className="text-xs text-muted-foreground bg-blue-50 rounded-lg p-3 space-y-1">
                  <p className="font-medium text-blue-700">ตัวอย่างราคาที่ผู้ซื้อจะเห็น:</p>
                  <p>• 1 ชิ้น = บาท {parseFloat(price) || 0} ต่อชิ้น (ราคาปกติ)</p>
                  {priceTiers.map((t, i) => (
                    <p key={i}>• {t.minQty}+ ชิ้น = บาท {t.pricePerUnit} ต่อชิ้น</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Button
            size="lg"
            className="w-full"
            disabled={!title || !price || images.length === 0 || isPending}
            onClick={handleSubmit}
          >
            {isPending ? "กำลังบันทึก..." : isEditMode ? "บันทึกการแก้ไข" : "ลงขายสินค้า"}
          </Button>
        </div>
      </div>
      <ImageSourceSheet
        open={photoPickerOpen}
        onOpenChange={setPhotoPickerOpen}
        onFiles={(files) => void handleImageUpload(files)}
        multiple
        title="ลงขายด้วยรูปภาพ"
        description="ถ่ายรูปสินค้า หรือเลือกจากคลัง แล้วกรอกรายละเอียด"
      />
    </div>
  );
}
