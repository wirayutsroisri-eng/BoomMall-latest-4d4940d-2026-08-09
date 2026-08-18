import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@shared/types";
import {
  isValidThaiPhone,
  isValidThaiZipCode,
  shippingAddressInputSchema,
  submitKycInputSchema,
} from "@shared/profile-validation";
import { CheckCircle2, Clock, Home, MapPin, Phone, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Link } from "wouter";
import { SellPhotoEntry } from "@/components/SellPhotoEntry";

function firstZodIssueMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
}

/** Allow digits, spaces and dashes while typing Thai phone numbers. */
function sanitizePhoneInput(value: string): string {
  return value.replace(/[^\d+\-\s]/g, "");
}

export default function KYCPage() {
  const { isAuthenticated } = useAuth();
  const [phone, setPhone] = useState("");

  // Shipping address state
  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingSubdistrict, setShippingSubdistrict] = useState("");
  const [shippingDistrict, setShippingDistrict] = useState("");
  const [shippingProvince, setShippingProvince] = useState("");
  const [shippingZipCode, setShippingZipCode] = useState("");

  const { data: kycData, refetch } = trpc.kyc.getStatus.useQuery(undefined, { enabled: isAuthenticated });
  const { data: savedAddress, refetch: refetchAddress } = trpc.kyc.getShippingAddress.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (savedAddress) {
      if (savedAddress.shippingName) setShippingName(savedAddress.shippingName);
      if (savedAddress.shippingPhone) setShippingPhone(savedAddress.shippingPhone);
      if (savedAddress.shippingAddress) setShippingAddress(savedAddress.shippingAddress);
      if (savedAddress.shippingSubdistrict) setShippingSubdistrict(savedAddress.shippingSubdistrict);
      if (savedAddress.shippingDistrict) setShippingDistrict(savedAddress.shippingDistrict);
      if (savedAddress.shippingProvince) setShippingProvince(savedAddress.shippingProvince);
      if (savedAddress.shippingZipCode) setShippingZipCode(savedAddress.shippingZipCode);
    }
  }, [savedAddress]);

  const submitKyc = trpc.kyc.submitKyc.useMutation({
    onSuccess: () => {
      toast.success("ยืนยันตัวตนสำเร็จแล้ว! คุณสามารถลงขายสินค้าได้เลย");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateShipping = trpc.kyc.updateShippingAddress.useMutation({
    onSuccess: () => {
      toast.success("บันทึกที่อยู่จัดส่งเรียบร้อยแล้ว");
      refetchAddress();
    },
    onError: (err) => toast.error(err.message),
  });

  const hasShippingAddress = savedAddress?.shippingName && savedAddress?.shippingAddress;

  if (!isAuthenticated) {
    return (
      <div className="container py-16 text-center">
        <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold mb-2">กรุณาเข้าสู่ระบบ</h2>
        <Link href="/"><Button type="button">กลับหน้าหลัก</Button></Link>
      </div>
    );
  }

  const status = kycData?.kycStatus ?? "none";

  const handleSubmitKyc = () => {
    const parsed = submitKycInputSchema.safeParse({ fullName: "-", phone });
    if (!parsed.success) {
      toast.error(firstZodIssueMessage(parsed.error));
      return;
    }
    submitKyc.mutate(parsed.data);
  };

  const handleSaveShipping = () => {
    const parsed = shippingAddressInputSchema.safeParse({
      shippingName,
      shippingPhone,
      shippingAddress,
      shippingSubdistrict,
      shippingDistrict,
      shippingProvince,
      shippingZipCode,
    });
    if (!parsed.success) {
      toast.error(firstZodIssueMessage(parsed.error));
      return;
    }
    updateShipping.mutate(parsed.data);
  };

  const canSubmitKyc = isValidThaiPhone(phone);
  const canSaveShipping =
    shippingName.trim() &&
    isValidThaiPhone(shippingPhone) &&
    shippingAddress.trim() &&
    shippingSubdistrict.trim() &&
    shippingDistrict.trim() &&
    shippingProvince.trim() &&
    isValidThaiZipCode(shippingZipCode);

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-lg space-y-6">

        {/* ─── KYC Section ─── */}
        <div className="text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: "Prompt, sans-serif" }}>
            ยืนยันตัวตนผู้ขาย
          </h1>
          <p className="text-muted-foreground text-sm">
            กรอกเบอร์โทรศัพท์เพื่อยืนยันตัวตนและเริ่มลงขายสินค้าได้ทันที
          </p>
        </div>

        {/* Status Card */}
        {status !== "none" && (
          <Card className={
            status === "approved" ? "border-green-200 bg-green-50" :
            status === "pending" ? "border-yellow-200 bg-yellow-50" :
            "border-red-200 bg-red-50"
          }>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-4">
                {status === "approved" && <CheckCircle2 className="w-7 h-7 text-green-600 shrink-0" />}
                {status === "pending" && <Clock className="w-7 h-7 text-yellow-600 shrink-0" />}
                {status === "rejected" && <XCircle className="w-7 h-7 text-red-600 shrink-0" />}
                <div>
                  <p className={`font-semibold ${
                    status === "approved" ? "text-green-800" :
                    status === "pending" ? "text-yellow-800" : "text-red-800"
                  }`}>
                    {status === "approved" && "ยืนยันตัวตนสำเร็จแล้ว!"}
                    {status === "pending" && "กำลังยืนยัน..."}
                    {status === "rejected" && "ไม่ผ่านการตรวจสอบ"}
                  </p>
                  {kycData?.kycSubmittedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ส่งเมื่อ: {formatDate(kycData.kycSubmittedAt)}
                    </p>
                  )}
                  {kycData?.kycReviewNote && status === "rejected" && (
                    <p className="text-sm text-red-700 mt-1">เหตุผล: {kycData.kycReviewNote}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Approved — CTA */}
        {status === "approved" && (
          <SellPhotoEntry>
            {(openPicker, busy) => (
              <Button type="button" className="w-full" size="lg" onClick={openPicker} disabled={busy}>
                {busy ? "กำลังโหลด..." : "เริ่มลงขายด้วยรูปภาพ"}
              </Button>
            )}
          </SellPhotoEntry>
        )}

        {/* Pending */}
        {status === "pending" && (
          <p className="text-center text-sm text-muted-foreground">กำลังดำเนินการ...</p>
        )}

        {/* Submit Form */}
        {(status === "none" || status === "rejected") && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">กรอกข้อมูลเพื่อยืนยันตัวตน</CardTitle>
              <CardDescription>ข้อมูลจะถูกใช้เพื่อยืนยันตัวตนเท่านั้น</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="flex items-center gap-1.5 mb-1.5">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  เบอร์โทรศัพท์ <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="text"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="เช่น 0999266218 หรือ 08x-xxx-xxxx"
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                  maxLength={16}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  รองรับเบอร์มือถือไทย 10 หลัก (ใส่ขีดหรือเว้นวรรคได้)
                </p>
              </div>
              <Button
                type="button"
                className="w-full"
                size="lg"
                disabled={!canSubmitKyc || submitKyc.isPending}
                onClick={handleSubmitKyc}
              >
                {submitKyc.isPending ? "กำลังยืนยัน..." : "ยืนยันตัวตนด้วยเบอร์โทร"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Shipping Address Section ─── */}
        <Separator />

        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <Home className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">ที่อยู่จัดส่ง</h2>
              <p className="text-xs text-muted-foreground">ระบบจะจำที่อยู่ไว้ ไม่ต้องกรอกซ้ำทุกครั้งที่ซื้อสินค้า</p>
            </div>
            {hasShippingAddress && (
              <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">บันทึกแล้ว</span>
            )}
          </div>

          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="mb-1.5 block">ชื่อผู้รับ <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    placeholder="ชื่อ-นามสกุลผู้รับสินค้า"
                    value={shippingName}
                    onChange={(e) => setShippingName(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="mb-1.5 block">เบอร์โทรผู้รับ <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="เช่น 0999266218 หรือ 08x-xxx-xxxx"
                    value={shippingPhone}
                    onChange={(e) => setShippingPhone(sanitizePhoneInput(e.target.value))}
                    maxLength={16}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="mb-1.5 block flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    บ้านเลขที่ / ถนน / ซอย <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    placeholder="เช่น 123/4 ถ.สุขุมวิท ซ.10"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">ตำบล/แขวง <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    placeholder="ตำบล/แขวง"
                    value={shippingSubdistrict}
                    onChange={(e) => setShippingSubdistrict(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">อำเภอ/เขต <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    placeholder="อำเภอ/เขต"
                    value={shippingDistrict}
                    onChange={(e) => setShippingDistrict(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">จังหวัด <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    placeholder="จังหวัด"
                    value={shippingProvince}
                    onChange={(e) => setShippingProvince(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">รหัสไปรษณีย์ <span className="text-red-500">*</span></Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="เช่น 10110"
                    value={shippingZipCode}
                    onChange={(e) => setShippingZipCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    maxLength={5}
                  />
                </div>
              </div>

              <Button
                type="button"
                className="w-full"
                variant={hasShippingAddress ? "outline" : "default"}
                disabled={!canSaveShipping || updateShipping.isPending}
                onClick={handleSaveShipping}
              >
                {updateShipping.isPending ? "กำลังบันทึก..." : hasShippingAddress ? "อัปเดตที่อยู่จัดส่ง" : "บันทึกที่อยู่จัดส่ง"}
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
