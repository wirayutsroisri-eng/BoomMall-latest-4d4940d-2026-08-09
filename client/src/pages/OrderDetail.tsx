import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDate, formatPrice, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@shared/types";
import { CheckCircle2, Package, Star, Truck, Upload, CreditCard, Building2, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { openBankApp } from "@/lib/bankDeepLink";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id ?? "0");
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [showCodAgreement, setShowCodAgreement] = useState(false);

  const { data: order, refetch } = trpc.orders.getById.useQuery({ id: orderId });
  const { data: existingReview } = trpc.reviews.getByOrder.useQuery(
    { orderId },
    { enabled: !!order && order.status === "completed" }
  );

  const uploadSlip = trpc.orders.uploadSlip.useMutation({
    onSuccess: () => {
      toast.success("อัปโหลดสลิปแล้ว รอผู้ขายยืนยัน");
      setSlipFile(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const sellerConfirmPayment = trpc.orders.sellerConfirmPayment.useMutation({
    onSuccess: () => {
      toast.success("ยืนยันรับเงินแล้ว กรุณาจัดส่งสินค้า");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const markShipped = trpc.orders.markShipped.useMutation({
    onSuccess: () => {
      toast.success("อัปเดตสถานะจัดส่งแล้ว");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const confirmReceived = trpc.orders.confirmReceived.useMutation({
    onSuccess: () => {
      toast.success("ยืนยันรับสินค้าแล้ว การซื้อขายเสร็จสมบูรณ์");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const acceptCodAgreement = trpc.orders.buyerAcceptCodAgreement.useMutation({
    onSuccess: () => {
      toast.success("ยอมรับเงื่อนไขแล้ว ผู้ขายจะจัดส่งสินค้าให้คุณเร็วๆ นี้");
      setShowCodAgreement(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: codAgreement } = trpc.orders.getCodAgreement.useQuery(undefined, {
    enabled: showCodAgreement,
  });

  const createReview = trpc.reviews.create.useMutation({
    onSuccess: () => {
      toast.success("รีวิวสำเร็จ");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleUploadSlip() {
    if (!slipFile) return;
    const base64 = await fileToBase64(slipFile);
    uploadSlip.mutate({
      orderId,
      slipBase64: base64,
      slipFilename: slipFile.name,
      slipContentType: slipFile.type,
    });
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  if (!order) {
    return (
      <div className="container py-16 text-center">
        <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  const isBuyer = user?.id === order.buyerId;
  const isSeller = user?.id === order.sellerId;
  const status = order.status;

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Prompt, sans-serif" }}>
            คำสั่งซื้อ #{order.id}
          </h1>
          <Badge className={ORDER_STATUS_COLORS[status as keyof typeof ORDER_STATUS_COLORS] ?? "bg-gray-100 text-gray-800"}>
            {ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] ?? status}
          </Badge>
        </div>

        {/* Product */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              {order.productImage ? (
                <img src={order.productImage} alt={order.productTitle} className="w-20 h-20 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center shrink-0">
                  <Package className="w-8 h-8 text-muted-foreground/30" />
                </div>
              )}
              <div>
                <p className="font-semibold">{order.productTitle}</p>
                <p className="text-2xl font-bold text-primary">{formatPrice(order.amount)}</p>
                <p className="text-xs text-muted-foreground">
                  วิธีชำระ: {order.paymentMethod === "promptpay" ? "PromptPay" : "โอนธนาคาร"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order info */}
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">ข้อมูลคำสั่งซื้อ</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">วันที่สั่ง</span>
              <span>{formatDate(order.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ที่อยู่จัดส่ง</span>
              <span className="text-right max-w-48">{order.shippingAddress}</span>
            </div>
            {order.trackingNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">เลขพัสดุ</span>
                <span className="font-mono">{order.trackingNumber}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Seller payment info (for buyer to pay directly) */}
        {isBuyer && status === "pending_payment" && (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                ข้อมูลการชำระเงินให้ผู้ขาย
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="bg-background rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground mb-2">โอนเงินจำนวน</p>
                <p className="text-2xl font-bold text-primary">{formatPrice(order.amount)}</p>
              </div>
              {(order as any).sellerPromptpayQrUrl && (
                <div className="p-3 bg-background rounded-lg border">
                  <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-primary" /> QR Code PromptPay
                  </p>
                  <div className="relative w-full rounded-lg overflow-hidden bg-white border" style={{ aspectRatio: "16/9" }}>
                    <img src={(order as any).sellerPromptpayQrUrl} alt="QR PromptPay" className="absolute inset-0 w-full h-full object-contain" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 text-center">สแกน QR Code เพื่อโอนเงินผ่าน PromptPay</p>
                </div>
              )}
              {order.sellerPromptpay && (
                <div className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                  <CreditCard className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">PromptPay</p>
                    <p className="font-mono text-lg font-bold">{order.sellerPromptpay}</p>
                  </div>
                </div>
              )}
              {order.sellerBankAccountNumber && (
                <div className="flex items-start gap-3 p-3 bg-background rounded-lg border">
                  <Building2 className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">{order.sellerBankName ?? "บัญชีธนาคาร"}</p>
                    <button
                      onClick={() => {
                        const result = openBankApp(order.sellerBankName ?? "", order.sellerBankAccountNumber ?? "");
                        if (result.opened) {
                          toast.success(result.message, { duration: 3000 });
                        } else {
                          navigator.clipboard.writeText(order.sellerBankAccountNumber ?? "")
                            .then(() => {
                              toast.success(
                                `คัดลอกเลขบัญชีแล้ว (${order.sellerBankAccountNumber})`,
                                { duration: 3000 }
                              );
                            })
                            .catch(() => {
                              toast.error("ไม่สามารถคัดลอกได้");
                            });
                        }
                      }}
                      title="แตะเพื่อเปิดแอปธนาคาร (หรือคัดลอกเลขบัญชี)"
                      className="font-mono text-lg font-bold underline decoration-dotted underline-offset-2 hover:text-primary transition-colors cursor-pointer flex items-center gap-2 group"
                    >
                      {order.sellerBankAccountNumber}
                      <Copy className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <p className="text-muted-foreground text-xs">{order.sellerBankAccountName}</p>
                  </div>
                </div>
              )}
              {!(order as any).sellerPromptpayQrUrl && !order.sellerPromptpay && !order.sellerBankAccountNumber && (
                <p className="text-muted-foreground text-center py-2">ผู้ขายยังไม่ได้ตั้งค่าข้อมูลการรับเงิน กรุณาติดต่อผู้ขายโดยตรง</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Slips */}
        {order.slips && order.slips.length > 0 && (
          <Card className="mb-4">
            <CardHeader><CardTitle className="text-base">สลิปการชำระเงิน</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {order.slips.map((slip: any) => (
                <div key={slip.id} className="flex items-center gap-3">
                  <img src={slip.slipUrl} alt="slip" className="w-16 h-16 object-cover rounded-lg border" />
                  <div>
                    <Badge className={
                      slip.status === "approved" ? "bg-green-100 text-green-800" :
                      slip.status === "rejected" ? "bg-red-100 text-red-800" :
                      "bg-yellow-100 text-yellow-800"
                    }>
                      {slip.status === "approved" ? "ยืนยันแล้ว" :
                       slip.status === "rejected" ? "ถูกปฏิเสธ" : "รอผู้ขายตรวจสอบ"}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{formatDate(slip.createdAt)}</p>
                    {slip.reviewNote && <p className="text-xs text-muted-foreground">{slip.reviewNote}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {/* Buyer: upload slip */}
          {isBuyer && status === "pending_payment" && (
            <Card>
              <CardHeader><CardTitle className="text-base">แนบสลิปการโอนเงิน</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">หลังโอนเงินให้ผู้ขายแล้ว กรุณาแนบสลิปเพื่อยืนยัน</p>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  {slipFile ? (
                    <p className="text-sm">{slipFile.name}</p>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload className="w-6 h-6" />
                      <p className="text-sm">คลิกเพื่อเลือกสลิป</p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)} />
                <Button
                  className="w-full"
                  disabled={!slipFile || uploadSlip.isPending}
                  onClick={handleUploadSlip}
                >
                  {uploadSlip.isPending ? "กำลังอัปโหลด..." : "ส่งสลิป"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Buyer: accept COD agreement */}
          {isBuyer && status === "waiting_buyer_confirm" && order.paymentMethod === "cod" && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  <p className="font-semibold text-sm text-amber-900">ผู้ขายยืนยันรับออเดอร์แล้ว</p>
                </div>
                <p className="text-xs text-amber-800">กรุณาอ่านและยอมรับเงื่อนไขการสั่งซื้อแบบเก็บเงินปลายทาง (COD) เพื่อให้ผู้ขายจัดส่งสินค้าให้คุณได้</p>
                {!showCodAgreement ? (
                  <Button
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => setShowCodAgreement(true)}
                  >
                    อ่านเงื่อนไข COD
                  </Button>
                ) : (
                  <div className="space-y-3">
                    {codAgreement && (
                      <div className="bg-white border border-amber-200 rounded-lg p-4 space-y-3 max-h-64 overflow-y-auto">
                        <h4 className="font-bold text-sm text-amber-900">{codAgreement.title}</h4>
                        {codAgreement.sections.map((s, i) => (
                          <div key={i}>
                            <p className="font-semibold text-xs text-amber-800">{s.heading}</p>
                            <p className="text-xs text-gray-700 whitespace-pre-line mt-1">{s.content}</p>
                          </div>
                        ))}
                        <p className="text-xs text-red-600 font-medium mt-2">{codAgreement.footer}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowCodAgreement(false)}
                      >
                        ยกเลิก
                      </Button>
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => acceptCodAgreement.mutate({ orderId })}
                        disabled={acceptCodAgreement.isPending}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        {acceptCodAgreement.isPending ? "กำลังยืนยัน..." : "ยอมรับเงื่อนไข"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Seller: waiting for buyer to accept COD agreement */}
          {isSeller && status === "waiting_buyer_confirm" && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⏳</span>
                  <p className="font-medium text-sm text-amber-800">รอผู้ซื้อยอมรับเงื่อนไข COD</p>
                </div>
                <p className="text-xs text-amber-700">ระบบส่งเงื่อนไขให้ผู้ซื้อแล้ว เมื่อผู้ซื้อกดยอมรับแล้ว คุณจะสามารถจัดส่งสินค้าได้</p>
              </CardContent>
            </Card>
          )}

          {/* Seller: COD order ready to ship (buyer accepted) */}
          {isSeller && status === "seller_confirmed" && order.paymentMethod === "cod" && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="font-medium text-sm text-green-800">ผู้ซื้อยอมรับเงื่อนไขแล้ว พร้อมจัดส่ง!</p>
                </div>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="เลขพัสดุ (ถ้ามี)"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => markShipped.mutate({ orderId, trackingNumber: trackingNumber || undefined })}
                  disabled={markShipped.isPending}
                >
                  <Truck className="w-4 h-4 mr-2" />
                  {markShipped.isPending ? "กำลังอัพเดต..." : "ยืนยันจัดส่งแล้ว"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Seller: confirm payment received */}
          {isSeller && status === "payment_submitted" && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4 space-y-3">
                <p className="font-medium text-sm text-green-800">ผู้ซื้อส่งสลิปการชำระเงินแล้ว</p>
                <p className="text-xs text-green-700">กรุณาตรวจสอบสลิปด้านบน แล้วยืนยันว่าได้รับเงินแล้ว</p>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => sellerConfirmPayment.mutate({ orderId })}
                  disabled={sellerConfirmPayment.isPending}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {sellerConfirmPayment.isPending ? "กำลังยืนยัน..." : "ยืนยันรับเงินแล้ว"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Seller: mark shipped */}
          {isSeller && status === "payment_confirmed" && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <p className="font-medium text-sm">อัปเดตสถานะจัดส่ง</p>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                  placeholder="เลขพัสดุ (ถ้ามี)"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
                <Button
                  className="w-full"
                  onClick={() => markShipped.mutate({ orderId, trackingNumber: trackingNumber || undefined })}
                  disabled={markShipped.isPending}
                >
                  <Truck className="w-4 h-4 mr-2" />
                  {markShipped.isPending ? "กำลังอัปเดต..." : "ยืนยันจัดส่งแล้ว"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Buyer: confirm received */}
          {isBuyer && status === "shipped" && (
            <Button
              size="lg"
              className="w-full"
              onClick={() => confirmReceived.mutate({ orderId })}
              disabled={confirmReceived.isPending}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {confirmReceived.isPending ? "กำลังยืนยัน..." : "ยืนยันรับสินค้าแล้ว"}
            </Button>
          )}

          {/* Buyer: review */}
          {isBuyer && status === "completed" && !existingReview && (
            <Card>
              <CardHeader><CardTitle className="text-base">รีวิวผู้ขาย</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => setRating(s)}>
                      <Star className={`w-7 h-7 transition-colors ${s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
                    </button>
                  ))}
                </div>
                <Textarea
                  placeholder="เขียนรีวิว..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
                <Button
                  className="w-full"
                  onClick={() => createReview.mutate({
                    orderId,
                    rating,
                    comment,
                  })}
                  disabled={createReview.isPending}
                >
                  {createReview.isPending ? "กำลังส่ง..." : "ส่งรีวิว"}
                </Button>
              </CardContent>
            </Card>
          )}

          {isBuyer && status === "completed" && existingReview && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-4 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="font-medium text-green-800">การซื้อขายเสร็จสมบูรณ์</p>
                <p className="text-sm text-green-700 mt-1">คุณได้รีวิวสินค้านี้แล้ว</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
