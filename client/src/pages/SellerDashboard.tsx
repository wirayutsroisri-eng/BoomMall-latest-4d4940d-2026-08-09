import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDate, formatPrice } from "@shared/types";
import { CountdownTimer } from "@/components/CountdownTimer";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";
import { toast } from "sonner";
import { useRef, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  pending_fee: "รออนุมัติ",
  pending_approval: "รออนุมัติ",
  active: "กำลังแสดงผล",
  hidden: "ซ่อนประกาศ",
  sold: "ขายแล้ว",
  rejected: "ถูกปฏิเสธ",
  expired: "หมดอายุ",
  deleted: "ลบแล้ว",
};

const STATUS_COLORS: Record<string, string> = {
  pending_fee: "bg-blue-100 text-blue-800",
  pending_approval: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  hidden: "bg-gray-100 text-gray-600",
  sold: "bg-purple-100 text-purple-800",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
  deleted: "bg-gray-100 text-gray-400",
};

/** คำนวณวันที่เหลือก่อนหมดอายุ */
function getDaysLeft(expiresAt: Date | null | undefined): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function SellerDashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const [soldDialog, setSoldDialog] = useState<{ productId: number; productTitle: string } | null>(null);
  const [saleSlipFile, setSaleSlipFile] = useState<File | null>(null);
  const [saleSlipPreview, setSaleSlipPreview] = useState<string | null>(null);
  const slipInputRef = useRef<HTMLInputElement>(null);

  const { data: myProducts, refetch: refetchProducts } = trpc.products.getMySelling.useQuery(
    { limit: 100, offset: 0 },
    { enabled: isAuthenticated }
  );

  const renewListing = trpc.products.renewListing.useMutation({
    onSuccess: (data) => {
      toast.success(`ต่ออายุสำเร็จ! หมดอายุ ${new Date(data.newExpiresAt).toLocaleDateString("th-TH")}`);
      refetchProducts();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const markAsSold = trpc.products.markAsSold.useMutation({
    onSuccess: (data) => {
      const msg = `ปิดประกาศ "ขายแล้ว" เรียบร้อย (ความมั่นใจสลิป ${data.confidence}%)`;
      toast.success(msg);
      setSoldDialog(null);
      setSaleSlipFile(null);
      setSaleSlipPreview(null);
      refetchProducts();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSoldSubmit = async () => {
    if (!soldDialog || !saleSlipFile) {
      toast.error("กรุณาเลือกรูปสลิปก่อน");
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(saleSlipFile);
    });
    markAsSold.mutate({
      productId: soldDialog.productId,
      saleSlipBase64: base64,
      saleSlipFilename: saleSlipFile.name,
      saleSlipContentType: saleSlipFile.type,
    });
  };

  const toggleHide = trpc.products.toggleHide.useMutation({
    onSuccess: (data) => {
      toast.success(data.newStatus === "hidden" ? "ซ่อนประกาศแล้ว" : "แสดงประกาศแล้ว");
      refetchProducts();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteProduct = trpc.products.delete.useMutation({
    onSuccess: () => {
      toast.success("ลบสินค้าเรียบร้อยแล้ว");
      refetchProducts();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const markSoldExternal = trpc.products.markSoldExternal.useMutation({
    onSuccess: () => {
      toast.success("ปิดประกาศเรียบร้อยแล้ว (ขายนอกระบบ)");
      refetchProducts();
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!isAuthenticated) {
    return (
      <div className="container py-16 text-center">
        <Store className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold mb-2">กรุณาเข้าสู่ระบบ</h2>
        <Link href="/"><Button>กลับหน้าหลัก</Button></Link>
      </div>
    );
  }

  if (user?.kycStatus !== "approved") {
    return (
      <div className="container py-16 max-w-md mx-auto text-center">
        <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-primary/30" />
        <h2 className="text-xl font-bold mb-2">ยืนยันตัวตนก่อนเปิดร้าน</h2>
        <p className="text-muted-foreground mb-6">
          คุณต้องยืนยันตัวตน (KYC) ก่อนจึงจะใช้งานแดชบอร์ดผู้ขายได้
        </p>
        <Link href="/kyc"><Button>ยืนยันตัวตนตอนนี้</Button></Link>
      </div>
    );
  }

  const products = myProducts?.items ?? [];
  const activeProducts = products.filter((p) => p.status === "active");
  const pendingApprovalProducts = products.filter(
    (p) => p.status === "pending_approval" || p.status === "pending_fee"
  );
  const soldProducts = products.filter((p) => p.status === "sold");
  const expiredProducts = products.filter((p) => p.status === "expired");

  // สินค้าที่ใกล้หมดอายุ (≤7 วัน)
  const nearExpiryProducts = activeProducts.filter((p) => {
    const days = getDaysLeft((p as any).expiresAt);
    return days !== null && days <= 7 && days > 0;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Prompt, sans-serif" }}>
            จัดการร้านค้า
          </h1>
          <div className="flex items-center gap-2">
          <Link href={`/shop/${user?.id}`}>
            <Button variant="outline" className="flex items-center gap-2">
              <Store className="w-4 h-4" />
              ดูหน้าร้าน
            </Button>
          </Link>
          <Link href="/seller/orders">
            <Button variant="outline" className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              คำสั่งซื้อ
            </Button>
          </Link>
                    <Link href="/sell">
            <Button className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              ลงขายสินค้า
            </Button>
          </Link>
          </div>
        </div>
        {/* Warning: ใกล้หมดอายุ */}
        {nearExpiryProducts.length > 0 && (
          <div className="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800 text-sm">
                มีสินค้า {nearExpiryProducts.length} รายการใกล้หมดอายุ
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                กดปุ่ม "ต่ออายุ" เพื่อขยายเวลาประกาศออกไปอีก 30 วัน
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">สินค้าทั้งหมด</p>
              <p className="text-2xl font-bold">{myProducts?.total ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">กำลังแสดงผล</p>
              <p className="text-2xl font-bold text-green-600">{activeProducts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">รออนุมัติ</p>
              <p className="text-2xl font-bold text-orange-500">{pendingApprovalProducts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">ขายแล้ว</p>
              <p className="text-2xl font-bold text-primary">{soldProducts.length}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="mb-4 flex-wrap h-auto gap-1">
            <TabsTrigger value="all">ทั้งหมด ({products.length})</TabsTrigger>
            <TabsTrigger value="active">
              กำลังขาย ({activeProducts.length})
              {nearExpiryProducts.length > 0 && (
                <span className="ml-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center">
                  {nearExpiryProducts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending_approval">รออนุมัติ ({pendingApprovalProducts.length})</TabsTrigger>
            <TabsTrigger value="sold">ขายแล้ว ({soldProducts.length})</TabsTrigger>
            {expiredProducts.length > 0 && (
              <TabsTrigger value="expired">หมดอายุ ({expiredProducts.length})</TabsTrigger>
            )}
          </TabsList>

          {(["all", "active", "pending_approval", "sold", "expired"] as const).map((tab) => {
            let tabProducts = products;
            if (tab === "active") tabProducts = activeProducts;
            else if (tab === "pending_approval") tabProducts = pendingApprovalProducts;
            else if (tab === "sold") tabProducts = soldProducts;
            else if (tab === "expired") tabProducts = expiredProducts;

            return (
              <TabsContent key={tab} value={tab}>
                {tabProducts.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>ไม่มีสินค้าในหมวดนี้</p>
                    {tab === "all" && (
                      <Link href="/sell">
                        <Button className="mt-4">ลงขายสินค้าแรก</Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tabProducts.map((product) => {
                      const daysLeft = getDaysLeft((product as any).expiresAt);
                      const isNearExpiry = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
                      const isExpiredStatus = product.status === "expired" || (daysLeft !== null && daysLeft <= 0);

                      return (
                        <Card
                          key={product.id}
                          className={`overflow-hidden transition-all ${isNearExpiry ? "border-amber-300 bg-amber-50/30" : ""} ${isExpiredStatus ? "opacity-70" : ""}`}
                        >
                          <CardContent className="p-3">
                            {/* Row 1: รูป + ข้อมูล + badge */}
                            <div className="flex items-start gap-3">
                              {/* รูปสินค้า */}
                              {(product.images as string[])?.[0] ? (
                                <img
                                  src={(product.images as string[])[0]}
                                  alt={product.title}
                                  className="w-14 h-14 rounded-lg object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center shrink-0">
                                  <Package className="w-5 h-5 text-muted-foreground/30" />
                                </div>
                              )}

                              {/* ข้อมูลสินค้า */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-medium text-sm leading-tight line-clamp-2 flex-1">{product.title}</p>
                                  <Badge className={`text-[10px] shrink-0 ${STATUS_COLORS[product.status] ?? "bg-gray-100 text-gray-800"}`}>
                                    {STATUS_LABELS[product.status] ?? product.status}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-primary font-bold text-sm">{formatPrice(product.price)}</p>
                                  <span className="text-xs text-muted-foreground">{(product as any).quantity ?? 1} ชิ้น</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{formatDate(product.createdAt)}</p>

                                {/* วันหมดอายุ + Countdown */}
                                {(product as any).expiresAt && product.status === "active" && (
                                  <div className="mt-1">
                                    <CountdownTimer expiresAt={(product as any).expiresAt} variant="compact" />
                                    <p className="text-[10px] text-muted-foreground">
                                      หมดอายุ {new Date((product as any).expiresAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                                    </p>
                                  </div>
                                )}

                                {/* Rejection note */}
                                {product.status === "rejected" && (product as any).rejectedNote && (
                                  <p className="text-xs text-red-600 mt-1">เหตุผล: {(product as any).rejectedNote}</p>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Action buttons — แสดงต่อเมื่อมีปุ่ม */}
                            {(product.status === "active" || product.status === "hidden" || product.status === "expired" || product.status === "rejected" || product.status === "sold" || product.status === "pending_approval" || product.status === "pending_fee") && (
                              <div className="mt-2.5 pt-2.5 border-t border-border/50">
                                {/* รออนุมัติ */}
                                {(product.status === "pending_approval" || product.status === "pending_fee") && (
                                  <div className="flex flex-wrap gap-1.5">
                                    <Button variant="outline" size="sm" className="text-xs h-7 text-red-500 border-red-300"
                                      onClick={() => { if (confirm("ลบสินค้าที่รออนุมัตินี้ออกจากระบบ? ไม่สามารถกู้คืนได้")) deleteProduct.mutate({ id: product.id }); }}
                                      disabled={deleteProduct.isPending}>
                                      <Trash2 className="w-3 h-3 mr-1" />ลบสินค้า
                                    </Button>
                                  </div>
                                )}
                                {/* กำลังขาย */}
                                {product.status === "active" && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {isNearExpiry && (
                                      <Button size="sm" className="text-xs h-7 bg-amber-500 hover:bg-amber-600 text-white"
                                        onClick={() => renewListing.mutate({ productId: product.id })} disabled={renewListing.isPending}>
                                        <RefreshCw className="w-3 h-3 mr-1" />ต่ออายุ
                                      </Button>
                                    )}
                                    <Button variant="outline" size="sm" className="text-xs h-7"
                                      onClick={() => toggleHide.mutate({ productId: product.id })} disabled={toggleHide.isPending}>
                                      <EyeOff className="w-3 h-3 mr-1" />ซ่อน
                                    </Button>
                                    <Button variant="outline" size="sm" className="text-xs h-7 text-green-700 border-green-300"
                                      onClick={() => setSoldDialog({ productId: product.id, productTitle: product.title })} disabled={markAsSold.isPending}>
                                      <CheckCircle className="w-3 h-3 mr-1" />ขายแล้ว
                                    </Button>
                                    <Button variant="outline" size="sm" className="text-xs h-7 text-orange-600 border-orange-300"
                                      onClick={() => { if (confirm("ยืนยันว่าสินค้านี้ขายไปนอกระบบแล้ว? ประกาศจะถูกปิดทันที")) markSoldExternal.mutate({ productId: product.id }); }}
                                      disabled={markSoldExternal.isPending}>
                                      <Package className="w-3 h-3 mr-1" />ขายนอกระบบ
                                    </Button>
                                    <Link href={`/sell?edit=${product.id}`}>
                                      <Button variant="outline" size="sm" className="text-xs h-7">แก้ไข</Button>
                                    </Link>
                                    <Button variant="outline" size="sm" className="text-xs h-7 text-red-500 border-red-300"
                                      onClick={() => { if (confirm("ลบสินค้านี้ออกจากระบบ? ไม่สามารถกู้คืนได้")) deleteProduct.mutate({ id: product.id }); }}
                                      disabled={deleteProduct.isPending}>
                                      <Trash2 className="w-3 h-3 mr-1" />ลบ
                                    </Button>
                                  </div>
                                )}

                                {/* ซ่อนอยู่ */}
                                {product.status === "hidden" && (
                                  <div className="flex flex-wrap gap-1.5">
                                    <Button variant="outline" size="sm" className="text-xs h-7"
                                      onClick={() => toggleHide.mutate({ productId: product.id })} disabled={toggleHide.isPending}>
                                      <Eye className="w-3 h-3 mr-1" />แสดงประกาศ
                                    </Button>
                                    <Button variant="outline" size="sm" className="text-xs h-7 text-green-700 border-green-300"
                                      onClick={() => setSoldDialog({ productId: product.id, productTitle: product.title })} disabled={markAsSold.isPending}>
                                      <CheckCircle className="w-3 h-3 mr-1" />ขายแล้ว
                                    </Button>
                                    <Button variant="outline" size="sm" className="text-xs h-7 text-orange-600 border-orange-300"
                                      onClick={() => { if (confirm("ยืนยันว่าสินค้านี้ขายไปนอกระบบแล้ว?")) markSoldExternal.mutate({ productId: product.id }); }}
                                      disabled={markSoldExternal.isPending}>
                                      <Package className="w-3 h-3 mr-1" />ขายนอกระบบ
                                    </Button>
                                    <Button variant="outline" size="sm" className="text-xs h-7 text-red-500 border-red-300"
                                      onClick={() => { if (confirm("ลบสินค้านี้ออกจากระบบ? ไม่สามารถกู้คืนได้")) deleteProduct.mutate({ id: product.id }); }}
                                      disabled={deleteProduct.isPending}>
                                      <Trash2 className="w-3 h-3 mr-1" />ลบ
                                    </Button>
                                  </div>
                                )}

                                {/* หมดอายุ */}
                                {product.status === "expired" && (
                                  <div className="flex flex-wrap gap-1.5">
                                    <Button size="sm" className="text-xs h-7 bg-primary text-white"
                                      onClick={() => renewListing.mutate({ productId: product.id })} disabled={renewListing.isPending}>
                                      <RefreshCw className="w-3 h-3 mr-1" />ต่ออายุประกาศ
                                    </Button>
                                    <Button variant="outline" size="sm" className="text-xs h-7 text-red-500 border-red-300"
                                      onClick={() => { if (confirm("ลบสินค้าที่หมดอายุนี้ออกจากระบบ?")) deleteProduct.mutate({ id: product.id }); }}
                                      disabled={deleteProduct.isPending}>
                                      <Trash2 className="w-3 h-3 mr-1" />ลบ
                                    </Button>
                                  </div>
                                )}

                                {/* ถูกปฏิเสธ */}
                                {product.status === "rejected" && (
                                  <div className="flex flex-wrap gap-1.5">
                                    <Link href={`/sell?edit=${product.id}`}>
                                      <Button variant="outline" size="sm" className="text-xs h-7">
                                        <Tag className="w-3 h-3 mr-1" />แก้ไขและส่งใหม่
                                      </Button>
                                    </Link>
                                    <Button variant="outline" size="sm" className="text-xs h-7 text-red-500 border-red-300"
                                      onClick={() => { if (confirm("ลบสินค้านี้ออกจากระบบ?")) deleteProduct.mutate({ id: product.id }); }}
                                      disabled={deleteProduct.isPending}>
                                      <Trash2 className="w-3 h-3 mr-1" />ลบ
                                    </Button>
                                  </div>
                                )}

                                {/* ขายแล้ว */}
                                {product.status === "sold" && (
                                  <div className="flex flex-wrap gap-1.5">
                                    <Button variant="outline" size="sm" className="text-xs h-7 text-red-500 border-red-300"
                                      onClick={() => { if (confirm("ลบสินค้าที่ขายแล้วนี้ออกจากระบบ?")) deleteProduct.mutate({ id: product.id }); }}
                                      disabled={deleteProduct.isPending}>
                                      <Trash2 className="w-3 h-3 mr-1" />ลบสินค้า
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      {/* Dialog อัปโหลดสลิปยืนยันการขาย */}
      <Dialog open={!!soldDialog} onOpenChange={(open) => { if (!open) { setSoldDialog(null); setSaleSlipFile(null); setSaleSlipPreview(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ยืนยันการขายสินค้า</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              สินค้า: <span className="font-medium text-foreground">{soldDialog?.productTitle}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              กรุณาอัปโหลดสลิปการโอนเงินเพื่อยืนยันว่าขายแล้วจริง
            </p>
            <input
              ref={slipInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setSaleSlipFile(file);
                const url = URL.createObjectURL(file);
                setSaleSlipPreview(url);
              }}
            />
            {saleSlipPreview ? (
              <div className="relative">
                <img src={saleSlipPreview} alt="สลิป" className="w-full max-h-48 object-contain rounded-lg border" />
                <button
                  className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                  onClick={() => { setSaleSlipFile(null); setSaleSlipPreview(null); }}
                >×</button>
              </div>
            ) : (
              <button
                className="w-full border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                onClick={() => slipInputRef.current?.click()}
              >
                <Upload className="w-8 h-8" />
                <span className="text-sm">กดเพื่อเลือกรูปสลิป</span>
                <span className="text-xs">JPG, PNG ไม่เกิน 5MB</span>
              </button>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setSoldDialog(null); setSaleSlipFile(null); setSaleSlipPreview(null); }}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleSoldSubmit}
              disabled={!saleSlipFile || markAsSold.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {markAsSold.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  กำลังตรวจสอบ...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  ยืนยันขายแล้ว
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
