import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatPrice } from "@shared/types";
import { ArrowLeft, CheckCircle, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { prepareImageForUpload, type PreparedImageUpload, ImageUploadError } from "@/lib/imageUpload";
import { MAX_IMAGE_UPLOAD_BYTES, formatUploadLimit } from "@shared/upload-limits";

interface PayFeeProps {
  params: { productId: string };
}

export default function PayFeePage({ params }: PayFeeProps) {
  const productId = parseInt(params.productId);
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const productsApi = trpc.products as any;
  const [slipPrepared, setSlipPrepared] = useState<PreparedImageUpload | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: product, isLoading } = trpc.products.getById.useQuery(
    { id: productId },
    { enabled: isAuthenticated && !isNaN(productId) }
  );

  const { data: paymentInfo } = productsApi.publicPaymentInfo.useQuery();

  const uploadFeeSlip = productsApi.uploadFeeSlip.useMutation({
    onSuccess: () => {
      setDone(true);
      toast.success("อัปโหลดสลิปสำเร็จ! รอ Admin ตรวจสอบ");
    },
    onError: (err: any) => {
      toast.error(err.message);
      setUploading(false);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const prepared = await prepareImageForUpload(file);
      setSlipPrepared(prepared);
      setSlipPreview(prepared.dataUrl);
    } catch (err) {
      toast.error(err instanceof ImageUploadError ? err.message : "อัปโหลดสลิปไม่สำเร็จ");
    }
  };

  const handleSubmit = async () => {
    if (!slipPrepared) return;
    setUploading(true);
    uploadFeeSlip.mutate({
      productId,
      filename: slipPrepared.filename,
      contentType: slipPrepared.contentType,
      base64: slipPrepared.base64,
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="container py-16 text-center">
        <p>กรุณาเข้าสู่ระบบ</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="container py-16 text-center text-muted-foreground">กำลังโหลด...</div>;
  }

  if (!product) {
    return <div className="container py-16 text-center text-muted-foreground">ไม่พบสินค้า</div>;
  }

  if (done) {
    return (
      <div className="container py-16 max-w-md mx-auto text-center">
        <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
        <h2 className="text-xl font-bold mb-2">อัปโหลดสลิปสำเร็จ!</h2>
        <p className="text-muted-foreground mb-6">
          Admin จะตรวจสอบสลิปและอนุมัติสินค้าของคุณภายใน 24 ชั่วโมง
        </p>
        <Link href="/seller/dashboard">
          <Button>กลับไปจัดการร้านค้า</Button>
        </Link>
      </div>
    );
  }

  const feeAmount = parseFloat((product as any).listingFeeAmount ?? "0");
  const feeRate = parseFloat((product as any).listingFeeRate ?? "7");

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-lg mx-auto">
        <Link href="/seller/dashboard">
          <Button variant="ghost" size="sm" className="mb-4 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </Button>
        </Link>

        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: "Prompt, sans-serif" }}>
          ชำระค่าธรรมเนียมการลงสินค้า
        </h1>

        {/* Product summary */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              {(product.images as string[])?.[0] && (
                <img
                  src={(product.images as string[])[0]}
                  alt={product.title}
                  className="w-16 h-16 rounded-lg object-cover shrink-0"
                />
              )}
              <div>
                <p className="font-medium">{product.title}</p>
                <p className="text-primary font-bold">{formatPrice(product.price)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fee info */}
        <Card className="mb-6 border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-orange-800">ค่าธรรมเนียมการลงสินค้า</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ราคาสินค้า</span>
                <span>{formatPrice(product.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">อัตราค่าธรรมเนียม</span>
                <span>{feeRate}%</span>
              </div>
              <div className="flex justify-between font-bold text-orange-800 border-t border-orange-200 pt-2">
                <span>ยอดที่ต้องชำระ</span>
                <span className="text-lg">{formatPrice(feeAmount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment info */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ช่องทางการชำระเงิน</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm space-y-2">
            <p className="text-muted-foreground">โอนเงินมาที่บัญชีของแพลตฟอร์ม:</p>
            <div className="bg-muted rounded-lg p-3 space-y-1">
              {paymentInfo?.promptpayNumber && (
                <p><span className="font-medium">PromptPay:</span> {paymentInfo.promptpayNumber}</p>
              )}
              {paymentInfo?.bankName && (
                <p><span className="font-medium">ธนาคาร:</span> {paymentInfo.bankName}</p>
              )}
              {paymentInfo?.bankAccountNumber && (
                <p><span className="font-medium">เลขบัญชี:</span> {paymentInfo.bankAccountNumber}</p>
              )}
              {paymentInfo?.bankAccountName && (
                <p><span className="font-medium">ชื่อบัญชี:</span> {paymentInfo.bankAccountName}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">* กรุณาโอนเงินให้ตรงกับจำนวนที่ระบุ แล้วอัปโหลดสลิปด้านล่าง</p>
          </CardContent>
        </Card>

        {/* Slip upload */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">อัปโหลดสลิปการโอนเงิน</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {slipPreview ? (
              <div className="space-y-3">
                <img
                  src={slipPreview}
                  alt="slip preview"
                  className="w-full max-h-64 object-contain rounded-lg border"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => { setSlipPrepared(null); setSlipPreview(null); }}
                >
                  เปลี่ยนรูป
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">คลิกเพื่ออัปโหลดสลิป</p>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG ขนาดไม่เกิน {formatUploadLimit(MAX_IMAGE_UPLOAD_BYTES)}</p>
              </button>
            )}
          </CardContent>
        </Card>

        <Button
          className="w-full"
          size="lg"
          disabled={!slipPrepared || uploading}
          onClick={handleSubmit}
        >
          {uploading ? "กำลังอัปโหลด..." : "ส่งสลิปเพื่อรออนุมัติ"}
        </Button>
      </div>
    </div>
  );
}
