import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useImageEditorModal } from "@/components/ImageEditorModal";
import { toast } from "sonner";
import { Link } from "wouter";
import { ArrowLeft, CreditCard, QrCode, Save } from "lucide-react";
import { getLoginUrl } from "@/const";
import { prepareImageForUpload, ImageUploadError } from "@/lib/imageUpload";

const THAI_BANKS = [
  "กสิกรไทย (KBank)",
  "ไทยพาณิชย์ (SCB)",
  "กรุงไทย (KTB)",
  "กรุงเทพ (BBL)",
  "ทหารไทยธนชาต (TTB)",
  "ออมสิน",
  "ธ.ก.ส.",
  "กรุงศรีอยุธยา (BAY)",
  "ยูโอบี (UOB)",
  "ซีไอเอ็มบี (CIMB)",
  "แลนด์แอนด์เฮ้าส์ (LH Bank)",
  "ทิสโก้ (TISCO)",
  "เกียรตินาคินภัทร (KKP)",
  "ไอซีบีซี (ICBC)",
  "ธนชาต (Thanachart)",
];

export default function PaymentSettingsPage() {
  const { isAuthenticated } = useAuth();
  const { openImageEditor, imageEditorModal } = useImageEditorModal();
  const { data, isLoading } = trpc.kyc.getPaymentDefaults.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [promptpayNumber, setPromptpayNumber] = useState("");
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setBankName(data.bankName ?? "");
      setBankAccountNumber(data.bankAccountNumber ?? "");
      setBankAccountName(data.bankAccountName ?? "");
      setPromptpayNumber(data.promptpayNumber ?? "");
      setQrPreview(data.defaultPromptpayQrUrl ?? null);
    }
  }, [data]);

  const updateMutation = trpc.kyc.updatePaymentDefaults.useMutation({
    onSuccess: () => toast.success("บันทึกข้อมูลบัญชีรับเงินสำเร็จ"),
    onError: (err: any) => toast.error(err.message ?? "เกิดข้อผิดพลาด"),
  });

  const handleSave = () => {
    updateMutation.mutate({
      bankName: bankName || undefined,
      bankAccountNumber: bankAccountNumber || undefined,
      bankAccountName: bankAccountName || undefined,
      promptpayNumber: promptpayNumber || undefined,
    });
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const editedFile = await openImageEditor(file, {
        title: "แต่งรูป QR Code",
        description: "ครอป ปรับมุม และจัดอัตราส่วนก่อนบันทึก QR Code",
        aspectOptions: ["1:1", "9:16"],
        initialAspect: "1:1",
      });
      if (!editedFile) return;

      const prepared = await prepareImageForUpload(editedFile);
      setQrPreview(prepared.dataUrl);
      updateMutation.mutate({
        bankName: bankName || undefined,
        bankAccountNumber: bankAccountNumber || undefined,
        bankAccountName: bankAccountName || undefined,
        promptpayNumber: promptpayNumber || undefined,
        defaultPromptpayQrUrl: prepared.dataUrl,
        defaultPromptpayQrKey: `qr-${Date.now()}`,
      });
    } catch (err) {
      toast.error(err instanceof ImageUploadError ? err.message : "อัปโหลด QR ไม่สำเร็จ");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 pb-20">
        <p className="text-muted-foreground text-sm">กรุณาเข้าสู่ระบบก่อน</p>
        <a href={getLoginUrl()}>
          <Button className="bg-orange-600 hover:bg-orange-700">เข้าสู่ระบบ</Button>
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-border/60 sticky top-0 z-10">
        <div className="container max-w-lg py-3 flex items-center gap-3">
          <Link href="/profile">
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          </Link>
          <h1 className="font-bold text-base">บัญชีรับเงิน</h1>
        </div>
      </div>

      <div className="container max-w-lg py-4 space-y-4">
        {/* Bank Account Section */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-5 h-5 text-orange-600" />
            <h2 className="font-bold text-sm">บัญชีธนาคาร</h2>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">ธนาคาร</Label>
              <select
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">-- เลือกธนาคาร --</option>
                {THAI_BANKS.map((bank) => (
                  <option key={bank} value={bank}>{bank}</option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">เลขที่บัญชี</Label>
              <Input
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="เช่น 1234567890"
                className="text-sm"
                maxLength={20}
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">ชื่อบัญชี</Label>
              <Input
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
                placeholder="ชื่อ-นามสกุลเจ้าของบัญชี"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        {/* PromptPay Section */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <QrCode className="w-5 h-5 text-orange-600" />
            <h2 className="font-bold text-sm">พร้อมเพย์ (PromptPay)</h2>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">เบอร์โทรหรือเลขบัตรประชาชน</Label>
              <Input
                value={promptpayNumber}
                onChange={(e) => setPromptpayNumber(e.target.value)}
                placeholder="เช่น 0812345678 หรือ 1234567890123"
                className="text-sm"
                maxLength={20}
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">QR Code พร้อมเพย์ (ไม่บังคับ)</Label>
              {qrPreview && (
                <div className="mb-2">
                  <img
                    src={qrPreview}
                    alt="QR Code"
                    className="w-32 h-32 object-contain border border-border rounded-lg"
                  />
                </div>
              )}
              <label className="cursor-pointer">
                <div className="border-2 border-dashed border-orange-300 rounded-lg p-3 text-center hover:bg-orange-50 transition-colors">
                  <QrCode className="w-6 h-6 text-orange-400 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">
                    {qrPreview ? "เปลี่ยน QR Code" : "อัปโหลด QR Code"}
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleQrUpload}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending || isLoading}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold h-12 rounded-xl"
        >
          <Save className="w-4 h-4 mr-2" />
          {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          ข้อมูลนี้จะแสดงให้ผู้ซื้อเห็นเมื่อทำการสั่งซื้อสินค้าของคุณ
        </p>
      </div>
      {imageEditorModal}
    </div>
  );
}
