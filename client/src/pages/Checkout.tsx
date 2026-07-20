import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatPrice } from "@shared/types";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Edit2,
  MapPin,
  Package,
  Upload,
  Wallet,
  Truck,
  Smartphone,
  QrCode,
  ChevronDown,
  Download,
  Copy,
  Check,
} from "lucide-react";
import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Link, useLocation, useParams } from "wouter";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import { openBankApp, getBankInfo } from "@/lib/bankDeepLink";

// ─── PromptPay QR generator ───────────────────────────────────────────────────
function generatePromptPayPayload(phone: string, amount: number): string {
  const clean = phone.replace(/[^0-9]/g, "");
  const normalized = clean.startsWith("0") ? "66" + clean.slice(1) : clean;
  function field(id: string, value: string) { return id + value.length.toString().padStart(2, "0") + value; }
  function crc16(data: string): string {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) { crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1; }
    }
    return ((crc & 0xffff) >>> 0).toString(16).toUpperCase().padStart(4, "0");
  }
  const merchantInfo = field("00", "A000000677010111") + field("01", normalized);
  const payload = field("00", "01") + field("01", "12") + field("29", merchantInfo) +
    field("53", "764") + field("54", amount.toFixed(2)) + field("58", "TH") + "6304";
  return payload + crc16(payload);
}

// ─── QR Image Block with save button ────────────────────────────────────────
function QRImageBlock({ qrUrl, promptpay }: { qrUrl: string; promptpay?: string | null }) {
  const [copied, setCopied] = useState(false);

  function handleSaveQR() {
    // Open image in new tab so user can long-press / right-click to save
    window.open(qrUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCopyNumber() {
    if (!promptpay) return;
    try {
      await navigator.clipboard.writeText(promptpay);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info("หมายเลข: " + promptpay);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR image — tap to open full size for saving */}
      <button
        type="button"
        onClick={handleSaveQR}
        className="w-full rounded-2xl overflow-hidden shadow-sm border border-border/30 bg-white active:opacity-80 transition-opacity"
        title="กดเพื่อเปิดรูปเต็ม แล้วกดค้างเพื่อบันทึก"
      >
        <img src={qrUrl} alt="PromptPay QR" className="w-full h-auto object-contain" />
      </button>
      {/* Save hint */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Download className="w-3.5 h-3.5" />
        <span>กดที่รูปเพื่อเปิดเต็มจอ แล้วกดค้างเพื่อบันทึก</span>
      </div>
      {/* Download button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 text-sm"
        onClick={handleSaveQR}
      >
        <Download className="w-4 h-4" />
        บันทึก QR Code
      </Button>
      {/* Promptpay number with copy */}
      {promptpay && (
        <button
          type="button"
          onClick={handleCopyNumber}
          className="w-full flex items-center justify-between bg-muted/40 rounded-xl px-4 py-2.5 hover:bg-muted/70 transition-colors"
        >
          <span className="text-xs text-muted-foreground">หมายเลขพร้อมเพย์ (กดเพื่อคัดลอก)</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm">{promptpay}</span>
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </button>
      )}
    </div>
  );
}

type PaymentMethod = "promptpay" | "bank_transfer" | "wallet" | "cod";

interface PaymentOption {
  id: PaymentMethod;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  requiresSlip: boolean;
  requiresWallet?: boolean;
  requiresSeller?: boolean; // requires seller to enable
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: "wallet",
    label: "ยอดเงินในระบบ (Wallet)",
    sublabel: "หักจากยอดเงินในบัญชีทันที",
    icon: <Wallet className="w-5 h-5" />,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    requiresSlip: false,
    requiresWallet: true,
    requiresSeller: true,
  },
  {
    id: "promptpay",
    label: "QR พร้อมเพย์",
    sublabel: "สแกน QR แล้วแนบสลิปการโอน",
    icon: <QrCode className="w-5 h-5" />,
    color: "text-primary",
    bgColor: "bg-primary/5",
    requiresSlip: true,
  },
  {
    id: "bank_transfer",
    label: "Mobile Banking",
    sublabel: "โอนเงินผ่านแอปธนาคาร แล้วแนบสลิป",
    icon: <Smartphone className="w-5 h-5" />,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    requiresSlip: true,
  },
  {
    id: "cod",
    label: "เก็บเงินปลายทาง (COD)",
    sublabel: "ชำระเงินเมื่อได้รับสินค้า",
    icon: <Truck className="w-5 h-5" />,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    requiresSlip: false,
    requiresSeller: true,
  },
];

// ─── Payment Method Card ──────────────────────────────────────────────────────
function PaymentMethodCard({
  option,
  selected,
  disabled,
  disabledReason,
  walletBalance,
  totalAmount,
  onClick,
}: {
  option: PaymentOption;
  selected: boolean;
  disabled: boolean;
  disabledReason?: string;
  walletBalance?: number;
  totalAmount: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3.5 transition-all text-left",
        selected && !disabled ? "bg-primary/5" : "bg-white hover:bg-muted/30",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      )}
    >
      {/* Radio circle */}
      <div className={cn(
        "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
        selected && !disabled ? "border-primary" : "border-border"
      )}>
        {selected && !disabled && (
          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
        )}
      </div>

      {/* Icon */}
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", option.bgColor, option.color)}>
        {option.icon}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", disabled ? "text-muted-foreground" : "text-foreground")}>
          {option.label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {disabledReason ?? option.sublabel}
        </p>
        {option.id === "wallet" && !disabled && walletBalance !== undefined && (
          <p className="text-xs font-semibold text-blue-600 mt-0.5">
            ยอดคงเหลือ: {formatPrice(walletBalance)}
            {walletBalance < totalAmount && (
              <span className="text-red-500 ml-1">(ไม่เพียงพอ)</span>
            )}
          </p>
        )}
      </div>

      {selected && !disabled && (
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
      )}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const productId = parseInt(id ?? "0");
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const selectedQty = (() => {
    try {
      const search = window.location.search;
      const params = new URLSearchParams(search);
      const q = parseInt(params.get("qty") ?? "1");
      return q > 0 ? q : 1;
    } catch { return 1; }
  })();

  const [orderId, setOrderId] = useState<number | null>(null);
  const [step, setStep] = useState<"confirm" | "payment" | "done">("confirm");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("promptpay");

  const slipInputRef = useRef<HTMLInputElement>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);

  const { data: product, isLoading: productLoading } = trpc.products.getById.useQuery(
    { id: productId },
    { enabled: !!productId }
  );
  const { data: savedAddress, isLoading: addressLoading } = trpc.kyc.getShippingAddress.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: walletData } = trpc.wallet.getBalance.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: order } = trpc.orders.getById.useQuery(
    { id: orderId! },
    { enabled: !!orderId }
  );

  const createOrder = trpc.orders.create.useMutation({
    onSuccess: (data) => {
      setOrderId(data.orderId);
      if (paymentMethod === "cod" || paymentMethod === "wallet") {
        setStep("done");
        toast.success(paymentMethod === "cod" ? "สั่งซื้อสำเร็จ! ผู้ขายจะเก็บเงินปลายทาง" : "ชำระด้วย Wallet สำเร็จ!");
      } else {
        setStep("payment");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadSlip = trpc.orders.uploadSlip.useMutation({
    onSuccess: () => { setStep("done"); toast.success("ส่งสลิปแล้ว! รอผู้ขายยืนยัน"); },
    onError: (err) => toast.error(err.message),
  });

  if (!isAuthenticated) {
    return (
      <div className="container py-16 text-center">
        <h2 className="text-xl font-semibold mb-4">กรุณาเข้าสู่ระบบก่อนสั่งซื้อ</h2>
        <a href={getLoginUrl()}><Button>เข้าสู่ระบบ</Button></a>
      </div>
    );
  }

  if (productLoading || addressLoading) {
    return (
      <div className="container py-8 max-w-lg space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container py-16 text-center">
        <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
        <h2 className="text-xl font-semibold mb-2">ไม่พบสินค้า</h2>
        <Link href="/products"><Button>ดูสินค้าทั้งหมด</Button></Link>
      </div>
    );
  }

  const basePrice = parseFloat(product.price as string);
  // คำนวณราคาต่อชิ้นตาม tier
  const priceTiers: { minQty: number; pricePerUnit: number }[] = (() => {
    try { return JSON.parse((product as any).priceTiers ?? "[]") || []; } catch { return []; }
  })();
  const effectivePricePerUnit = (() => {
    if (priceTiers.length === 0) return basePrice;
    const sorted = [...priceTiers].sort((a, b) => b.minQty - a.minQty);
    const matched = sorted.find(t => selectedQty >= t.minQty);
    return matched ? matched.pricePerUnit : basePrice;
  })();
  const price = effectivePricePerUnit * selectedQty;
  const shippingFee = parseFloat((product as any).shippingFee ?? "0") || 0;
  const COD_FEE_RATE = 0.03;
  const codFee = paymentMethod === "cod" ? Math.ceil(price * COD_FEE_RATE) : 0;
  const totalAmount = price + shippingFee + codFee;
  const allowCod = (product as any).allowCod ?? false;
  const allowWallet = (product as any).allowWallet ?? false;
  const allowPromptpay = (product as any).allowPromptpay ?? true; // default true เพื่อ backward compat
  const walletBalance = parseFloat(String(walletData?.balance ?? "0")) || 0;
  const hasEnoughWallet = walletBalance >= totalAmount;

  const hasAddress = !!(savedAddress?.shippingName && savedAddress?.shippingAddress);
  const fullAddress = hasAddress
    ? [savedAddress!.shippingAddress, savedAddress!.shippingSubdistrict, savedAddress!.shippingDistrict, savedAddress!.shippingProvince, savedAddress!.shippingZipCode].filter(Boolean).join(" ")
    : "";

  function getOptionState(opt: PaymentOption): { disabled: boolean; reason?: string } {
    if (opt.id === "wallet") {
      if (!allowWallet) return { disabled: true, reason: "ผู้ขายไม่รับชำระผ่าน Wallet" };
      if (!hasEnoughWallet) return { disabled: false }; // allow select but show warning
    }
    if (opt.id === "cod") {
      if (!allowCod) return { disabled: true, reason: "ผู้ขายไม่รับเก็บเงินปลายทาง" };
    }
    if (opt.id === "promptpay" || opt.id === "bank_transfer") {
      if (!allowPromptpay) return { disabled: true, reason: "ผู้ขายไม่รับโอนเงิน/PromptPay" };
    }
    return { disabled: false };
  }

  function handleConfirmOrder() {
    if (!hasAddress) {
      toast.error("กรุณากรอกที่อยู่จัดส่งในหน้าโปรไฟล์ก่อน");
      navigate("/profile");
      return;
    }
    if (paymentMethod === "wallet" && !hasEnoughWallet) {
      toast.error(`ยอด Wallet ไม่เพียงพอ (มี ${formatPrice(walletBalance)}, ต้องการ ${formatPrice(totalAmount)})`);
      return;
    }
    createOrder.mutate({
      productId,
      shippingAddress: `${savedAddress!.shippingName} | ${savedAddress!.shippingPhone} | ${fullAddress}`,
      paymentMethod,
    });
  }

  function handleSlipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("ไฟล์ใหญ่เกิน 5MB"); return; }
    setSlipFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSlipPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleUploadSlip() {
    if (!slipFile || !orderId) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      uploadSlip.mutate({
        orderId,
        slipBase64: dataUrl.split(",")[1],
        slipFilename: slipFile.name,
        slipContentType: slipFile.type,
      });
    };
    reader.readAsDataURL(slipFile);
  }

  // ดึงข้อมูลการชำระเงินจาก product fields (Phase 28) ก่อน แล้ว fallback ไป seller/order
  const productPromptpayQrUrl = (product as any).promptpayQrUrl ?? null;
  const productBankName = (product as any).bankName ?? (product as any).seller?.bankName ?? null;
  const productBankAccountName = (product as any).bankAccountName ?? (product as any).seller?.bankAccountName ?? null;
  const productBankAccountNumber = (product as any).bankAccountNumber ?? (product as any).seller?.bankAccountNumber ?? null;

  const promptpay = order?.sellerPromptpay ?? (product as any).seller?.promptpayNumber ?? null;
  const sellerBankName = order?.sellerBankName ?? productBankName;
  const sellerBankAccountName = order?.sellerBankAccountName ?? productBankAccountName;
  const sellerBankAccountNumber = order?.sellerBankAccountNumber ?? productBankAccountNumber;

  // ─── Step: Confirm ──────────────────────────────────────────────────────────
  if (step === "confirm") {
    const primaryOptions = PAYMENT_OPTIONS.filter(o => o.id === "wallet");
    const otherOptions = PAYMENT_OPTIONS.filter(o => o.id !== "wallet");

    return (
      <div className="min-h-screen bg-[#f5f5f5]">
        {/* Header */}
        <div className="bg-white sticky top-0 z-10 border-b border-border/20">
          <div className="container max-w-lg flex items-center gap-3 py-3.5">
            <Link href={`/products/${productId}`} className="p-1.5 rounded-full hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-semibold text-base">ช่องทางการชำระเงิน</h1>
          </div>
        </div>

        <div className="container max-w-lg py-3 space-y-3">

          {/* Shipping Address */}
          {hasAddress ? (
            <div className="bg-white rounded-2xl overflow-hidden cursor-pointer" onClick={() => navigate("/profile")}>
              <div className="flex items-start gap-3 p-4">
                <MapPin className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm">{savedAddress!.shippingName}</span>
                    <span className="text-sm text-muted-foreground">{savedAddress!.shippingPhone}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{fullAddress}</p>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                  <Edit2 className="w-3.5 h-3.5" />
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
              <div className="h-1 bg-gradient-to-r from-primary/80 via-primary to-primary/80" />
            </div>
          ) : (
            <div
              className="bg-white rounded-2xl p-4 flex items-center gap-3 cursor-pointer border-2 border-dashed border-primary/30"
              onClick={() => navigate("/profile")}
            >
              <MapPin className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm text-primary">เพิ่มที่อยู่จัดส่ง</p>
                <p className="text-xs text-muted-foreground mt-0.5">กรุณากรอกที่อยู่ในหน้าโปรไฟล์ก่อนสั่งซื้อ</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          )}

          {/* Product summary */}
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="flex gap-3 p-4">
              {(product.images as string[])?.[0] ? (
                <img src={(product.images as string[])[0]} alt={product.title} className="w-16 h-16 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Package className="w-6 h-6 text-muted-foreground/30" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm line-clamp-2">{product.title}</p>
                <p className="text-xs text-muted-foreground mt-1 capitalize">{product.condition}</p>
                <p className="text-base font-bold text-primary mt-1">{formatPrice(product.price)}</p>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-white rounded-2xl overflow-hidden divide-y divide-border/10">
            {/* Wallet section */}
            {primaryOptions.map((opt) => {
              const { disabled, reason } = getOptionState(opt);
              return (
                <PaymentMethodCard
                  key={opt.id}
                  option={opt}
                  selected={paymentMethod === opt.id}
                  disabled={disabled}
                  disabledReason={reason}
                  walletBalance={walletBalance}
                  totalAmount={totalAmount}
                  onClick={() => setPaymentMethod(opt.id)}
                />
              );
            })}

            {/* Divider label */}
            <div className="px-4 py-2.5 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground">ช่องทางการชำระเงินอื่น</p>
            </div>

            {/* Other options */}
            {otherOptions.map((opt) => {
              const { disabled, reason } = getOptionState(opt);
              return (
                <PaymentMethodCard
                  key={opt.id}
                  option={opt}
                  selected={paymentMethod === opt.id}
                  disabled={disabled}
                  disabledReason={reason}
                  walletBalance={walletBalance}
                  totalAmount={totalAmount}
                  onClick={() => setPaymentMethod(opt.id)}
                />
              );
            })}
          </div>

          {/* Price summary */}
          <div className="bg-white rounded-2xl p-4 space-y-2.5">
            <p className="text-xs font-semibold text-muted-foreground mb-1">สรุปยอดชำระ</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                ราคาสินค้า{selectedQty > 1 ? ` (${selectedQty} ชิ้น × ${formatPrice(effectivePricePerUnit)})` : ""}
              </span>
              <span>{formatPrice(price)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">ค่าจัดส่ง</span>
              {shippingFee > 0 ? (
                <span>{formatPrice(shippingFee)}</span>
              ) : (
                <span className="text-green-600 font-medium">ฟรี</span>
              )}
            </div>
            {paymentMethod === "cod" && (
              <div className="flex justify-between text-sm">
                <span className="text-orange-600">ค่าบริการ COD (3%)</span>
                <span className="text-orange-600 font-medium">+{formatPrice(codFee)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold">
              <span>ยอดรวมทั้งหมด</span>
              <span className="text-primary text-lg">{formatPrice(totalAmount)}</span>
            </div>
            {paymentMethod === "cod" && (
              <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
                ชำระ {formatPrice(totalAmount)} เมื่อได้รับสินค้า (รวมค่าบริการ COD 3%)
              </p>
            )}
            {paymentMethod === "wallet" && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                หักจาก Wallet: {formatPrice(walletBalance)} → เหลือ {formatPrice(Math.max(0, walletBalance - totalAmount))}
              </p>
            )}
          </div>

          {/* PromptPay preview in confirm step */}
          {paymentMethod === "promptpay" && (() => {
            const prevPromptpay = (product as any).promptpayNumber ?? (product as any).seller?.promptpayNumber ?? null;
            const prevQrUrl = (product as any).promptpayQrUrl ?? null;
            const prevPayload = prevPromptpay ? generatePromptPayPayload(prevPromptpay, totalAmount) : null;
            const prevQr = prevQrUrl ?? (prevPayload ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(prevPayload)}` : null);
            if (!prevQr && !prevPromptpay) return null;
            return (
              <div className="bg-white rounded-2xl p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3">ข้อมูลพร้อมเพย์ผู้ขาย</p>
                {prevQr && (
                  <div className="w-full rounded-xl overflow-hidden border border-border/30 bg-white mb-3">
                    <img src={prevQr} alt="PromptPay QR" className="w-full h-auto object-contain" />
                  </div>
                )}
                {prevPromptpay && (
                  <div className="flex items-center justify-between bg-muted/40 rounded-xl px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">หมายเลขพร้อมเพย์</span>
                    <span className="font-mono font-bold text-sm">{prevPromptpay}</span>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="h-24" />
        </div>

        {/* Bottom CTA */}
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 bg-white border-t border-border/20 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="container max-w-lg py-3">
            <Button
              className="w-full h-12 text-base font-semibold rounded-full"
              disabled={!hasAddress || createOrder.isPending || (paymentMethod === "wallet" && !hasEnoughWallet)}
              onClick={handleConfirmOrder}
            >
              {createOrder.isPending
                ? "กำลังสร้างออเดอร์..."
                : paymentMethod === "cod"
                ? `ยืนยัน — เก็บเงินปลายทาง ${formatPrice(totalAmount)} (รวม COD 3%)`
                : paymentMethod === "wallet"
                ? `ชำระด้วย Wallet ${formatPrice(totalAmount)}`
                : `ยืนยัน — ${formatPrice(totalAmount)}`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Payment (PromptPay / Mobile Banking) ───────────────────────────
  if (step === "payment") {
    const isPromptPay = paymentMethod === "promptpay";
    const promptPayPayload = promptpay ? generatePromptPayPayload(promptpay, totalAmount) : null;
    // ใช้ QR Code ที่อัปโหลดไว้ก่อน (ถ้ามี) หรือสร้างจาก promptpayNumber
    const qrUrl = productPromptpayQrUrl
      ? productPromptpayQrUrl
      : promptPayPayload
        ? `https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=${encodeURIComponent(promptPayPayload)}`
        : null;

    return (
      <div className="min-h-screen bg-[#f5f5f5]">
        <div className="bg-white sticky top-0 z-10 border-b border-border/20">
          <div className="container max-w-lg flex items-center gap-3 py-3.5">
            <button className="p-1.5 rounded-full hover:bg-muted transition-colors" onClick={() => setStep("confirm")}>
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-semibold text-base">
              {isPromptPay ? "ชำระผ่าน QR พร้อมเพย์" : "ชำระผ่าน Mobile Banking"}
            </h1>
          </div>
        </div>

        <div className="container max-w-lg py-4 space-y-3">
          {/* Payment info */}
          <div className="bg-white rounded-2xl p-5">
            {isPromptPay ? (
              <>
                <p className="text-sm font-semibold text-center mb-4">สแกน QR Code เพื่อโอนเงิน</p>
                {qrUrl ? (
                  <QRImageBlock qrUrl={qrUrl} promptpay={promptpay} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <QrCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">ผู้ขายยังไม่ได้ตั้งค่า PromptPay</p>
                    <p className="text-xs mt-1">กรุณาติดต่อผู้ขายโดยตรง</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-indigo-600" />
                  ข้อมูลบัญชีธนาคาร
                </p>
                {sellerBankName || sellerBankAccountNumber ? (
                  <div className="space-y-3">
                    {sellerBankName && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">ธนาคาร</span>
                        <span className="font-semibold">{sellerBankName}</span>
                      </div>
                    )}
                    {sellerBankAccountName && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">ชื่อบัญชี</span>
                        <span className="font-semibold">{sellerBankAccountName}</span>
                      </div>
                    )}
                    {sellerBankAccountNumber && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">เลขบัญชี</span>
                        <button
                          className="flex items-center gap-2 group"
                          onClick={() => {
                            // เปิดแอปธนาคาร + copy account number
                            const result = openBankApp(sellerBankName, sellerBankAccountNumber);
                            if (result.opened) {
                              toast.success(result.message, { duration: 3000 });
                            } else {
                              // Fallback: copy to clipboard
                              navigator.clipboard.writeText(sellerBankAccountNumber)
                                .then(() => {
                                  toast.success(
                                    `คัดลอกเลขบัญชีแล้ว (${sellerBankAccountNumber})`,
                                    { duration: 3000 }
                                  );
                                })
                                .catch(() => {
                                  toast.error("ไม่สามารถคัดลอกได้ กรุณาจดเลขบัญชีเอง");
                                });
                            }
                          }}
                          title="แตะเพื่อเปิดแอปธนาคาร (หรือคัดลอกเลขบัญชี)"
                        >
                          <span className="font-mono font-bold text-base underline decoration-dotted underline-offset-2 group-hover:text-primary transition-colors">
                            {sellerBankAccountNumber}
                          </span>
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <Copy className="w-3 h-3" />
                            เปิดแอป
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Smartphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">ผู้ขายยังไม่ได้ตั้งค่าบัญชีธนาคาร</p>
                    <p className="text-xs mt-1">กรุณาติดต่อผู้ขายโดยตรง</p>
                  </div>
                )}
              </>
            )}

            <div className="mt-4 bg-primary/5 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">ยอดที่ต้องโอน</p>
              <p className="text-2xl font-bold text-primary">{formatPrice(totalAmount)}</p>
              {shippingFee > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">รวมค่าขนส่ง {formatPrice(shippingFee)}</p>
              )}
            </div>
          </div>

          {/* Upload slip */}
          <div className="bg-white rounded-2xl p-4">
            <p className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              แนบสลิปการโอนเงิน
            </p>
            <input ref={slipInputRef} type="file" accept="image/*" className="hidden" onChange={handleSlipChange} />
            {slipPreview ? (
              <div className="space-y-2">
                <img src={slipPreview} alt="slip" className="w-full max-h-64 object-contain rounded-xl border border-border/30" />
                <Button variant="outline" size="sm" className="w-full" onClick={() => { setSlipFile(null); setSlipPreview(null); if (slipInputRef.current) slipInputRef.current.value = ""; }}>
                  เปลี่ยนรูปสลิป
                </Button>
              </div>
            ) : (
              <button
                onClick={() => slipInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border/50 rounded-xl p-8 text-center hover:border-primary/40 hover:bg-primary/5 transition-colors"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">กดเพื่อเลือกรูปสลิป</p>
                <p className="text-xs text-muted-foreground/60 mt-1">JPG, PNG ไม่เกิน 5MB</p>
              </button>
            )}
          </div>

          <div className="h-24" />
        </div>

        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 bg-white border-t border-border/20 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="container max-w-lg py-3">
            <Button
              className="w-full h-12 text-base font-semibold rounded-full"
              disabled={!slipFile || uploadSlip.isPending}
              onClick={handleUploadSlip}
            >
              {uploadSlip.isPending ? "กำลังส่งสลิป..." : "ยืนยันการชำระเงิน"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Done ─────────────────────────────────────────────────────────────
  const paymentLabel = {
    promptpay: "QR พร้อมเพย์",
    bank_transfer: "Mobile Banking",
    wallet: "Wallet",
    cod: "เก็บเงินปลายทาง",
  }[paymentMethod];

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-4 shadow-sm">
        <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">สั่งซื้อสำเร็จ!</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {paymentMethod === "cod"
              ? "ผู้ขายจะจัดส่งและเก็บเงินปลายทาง"
              : paymentMethod === "wallet"
              ? "หักจาก Wallet เรียบร้อยแล้ว"
              : "รอผู้ขายยืนยันการชำระเงิน"}
          </p>
        </div>
        <div className="bg-muted/40 rounded-xl p-3 text-sm text-left space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">หมายเลขออเดอร์</span>
            <span className="font-mono font-semibold">#{orderId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">สินค้า</span>
            <span className="font-medium text-right max-w-[60%] truncate">{product.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">ยอดชำระ</span>
            <span className="font-bold text-primary">{formatPrice(totalAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">วิธีชำระ</span>
            <span className="font-medium">{paymentLabel}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/products" className="flex-1">
            <Button variant="outline" className="w-full rounded-full">ช้อปต่อ</Button>
          </Link>
          <Button className="flex-1 rounded-full" onClick={() => navigate("/orders")}>
            ดูออเดอร์
          </Button>
        </div>
      </div>
    </div>
  );
}
