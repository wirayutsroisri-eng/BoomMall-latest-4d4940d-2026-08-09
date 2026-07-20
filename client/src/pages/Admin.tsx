import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDate, formatPrice } from "@shared/types";
import {
  BarChart3,
  CheckCircle2,
  Package,
  Settings,
  ShieldCheck,
  Users,
  XCircle,
  FileText,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";

export default function AdminPage() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="container py-16 text-center">
        <ShieldCheck className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
        <Link href="/"><Button>กลับหน้าหลัก</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "Prompt, sans-serif" }}>
              Admin Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">จัดการระบบ Marketplace</p>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4" /> ภาพรวม
            </TabsTrigger>
            <TabsTrigger value="kyc" className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> KYC
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-1.5">
              <Package className="w-4 h-4" /> อนุมัติสินค้า
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-1.5">
              <Users className="w-4 h-4" /> ผู้ใช้
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1.5">
              <Settings className="w-4 h-4" /> ตั้งค่า
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="kyc"><KYCTab /></TabsContent>
          <TabsContent value="products"><ProductsApprovalTab /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data: stats } = trpc.admin.stats.useQuery();

  const statCards = [
    { label: "ผู้ใช้ทั้งหมด", value: stats?.totalUsers ?? 0, icon: Users, color: "text-blue-600" },
    { label: "สินค้าทั้งหมด", value: stats?.totalProducts ?? 0, icon: Package, color: "text-green-600" },
    { label: "รออนุมัติสินค้า", value: (stats as any)?.pendingProducts ?? 0, icon: FileText, color: "text-orange-500" },
    { label: "รอยืนยัน KYC", value: stats?.pendingKyc ?? 0, icon: ShieldCheck, color: "text-purple-500" },
    { label: "รายได้รวม (บาท)", value: formatPrice((stats as any)?.totalRevenue ?? 0), icon: TrendingUp, color: "text-emerald-600", isText: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {statCards.map((s) => (
        <Card key={s.label}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color} mt-0.5`}>
                  {s.isText ? s.value : s.value}
                </p>
              </div>
              <s.icon className={`w-8 h-8 ${s.color} opacity-20`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── KYC Tab ─────────────────────────────────────────────────────────────────
function KYCTab() {
  const { data: pending, refetch } = trpc.kyc.adminListPending.useQuery();
  const [rejectNote, setRejectNote] = useState("");
  const [rejectId, setRejectId] = useState<number | null>(null);

  const approve = trpc.kyc.adminApprove.useMutation({
    onSuccess: () => { toast.success("อนุมัติ KYC แล้ว"); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });
  const reject = trpc.kyc.adminReject.useMutation({
    onSuccess: () => { toast.success("ปฏิเสธ KYC แล้ว"); refetch(); setRejectId(null); setRejectNote(""); },
    onError: (err: any) => toast.error(err.message),
  });

  if (!pending || pending.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>ไม่มีคำขอ KYC รอตรวจสอบ</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{pending.length} คำขอรอตรวจสอบ</p>
      {pending.map((u: any) => (
        <Card key={u.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold">{u.name}</p>
                <p className="text-sm text-muted-foreground">{u.email}</p>
                {u.kycFullName && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">ชื่อ-นามสกุล: </span>
                    <span className="font-medium">{u.kycFullName}</span>
                  </p>
                )}
                {u.kycPhone && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">เบอร์โทร: </span>
                    <span className="font-medium">{u.kycPhone}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">ส่งเมื่อ: {formatDate(u.kycSubmittedAt)}</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setRejectId(u.id)}
                >
                  <XCircle className="w-4 h-4 mr-1" /> ปฏิเสธ
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => approve.mutate({ userId: u.id })}
                  disabled={approve.isPending}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" /> อนุมัติ
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={rejectId !== null} onOpenChange={() => setRejectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปฏิเสธ KYC</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="ระบุเหตุผล..."
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>ยกเลิก</Button>
            <Button
              variant="destructive"
              disabled={!rejectNote || reject.isPending}
              onClick={() => rejectId && reject.mutate({ userId: rejectId, note: rejectNote })}
            >
              ยืนยันปฏิเสธ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Products Approval Tab ────────────────────────────────────────────────────
function ProductsApprovalTab() {
  const { data: pending, refetch } = trpc.products.adminPendingProducts.useQuery({ limit: 50, offset: 0 });
  const [rejectNote, setRejectNote] = useState("");
  const [rejectProductId, setRejectProductId] = useState<number | null>(null);

  const approve = trpc.products.adminApproveProduct.useMutation({
    onSuccess: () => { toast.success("อนุมัติสินค้าแล้ว สินค้าจะแสดงบนแพลตฟอร์มทันที"); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });
  const reject = trpc.products.adminRejectProduct.useMutation({
    onSuccess: () => {
      toast.success("ปฏิเสธสินค้าแล้ว");
      refetch();
      setRejectProductId(null);
      setRejectNote("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!pending || pending.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>ไม่มีสินค้ารออนุมัติ</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{pending.length} สินค้ารออนุมัติ</p>
      {pending.map((product: any) => {
        return (
          <Card key={product.id}>
            <CardContent className="p-4 space-y-3">
              {/* Product info */}
              <div className="flex items-start gap-3">
                {product.images?.[0] && (
                  <img
                    src={product.images[0]}
                    alt={product.title}
                    className="w-16 h-16 rounded-lg object-cover border shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{product.title}</p>
                  <p className="text-primary font-bold">{formatPrice(product.price)}</p>
                  <p className="text-xs text-muted-foreground">
                    ผู้ขาย: {product.seller?.name ?? "ไม่ทราบ"}
                    {product.seller?.phone && ` · ${product.seller.phone}`}
                  </p>
                  <p className="text-xs text-muted-foreground">ลงขาย: {formatDate(product.createdAt)}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50 flex-1"
                  onClick={() => {
                    setRejectProductId(product.id);
                  }}
                >
                  <XCircle className="w-4 h-4 mr-1" /> ปฏิเสธ
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 flex-1"
                  onClick={() => approve.mutate({ productId: product.id })}
                  disabled={approve.isPending}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" /> อนุมัติ
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={rejectProductId !== null} onOpenChange={() => setRejectProductId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปฏิเสธสินค้า</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">ระบุเหตุผลที่ปฏิเสธสินค้าชิ้นนี้</p>
          <Textarea
            placeholder="ระบุเหตุผล เช่น สลิปไม่ชัดเจน, ยอดเงินไม่ถูกต้อง..."
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectProductId(null)}>ยกเลิก</Button>
            <Button
              variant="destructive"
              disabled={!rejectNote || reject.isPending}
              onClick={() =>
                rejectProductId &&
                reject.mutate({
                  productId: rejectProductId,
                  note: rejectNote,
                })
              }
            >
              ยืนยันปฏิเสธ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const { data: users } = trpc.admin.users.useQuery({ limit: 100, offset: 0 });

  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => toast.success("อัปเดตสิทธิ์แล้ว"),
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{users?.length ?? 0} ผู้ใช้ทั้งหมด</p>
      {users?.map((u: any) => (
        <Card key={u.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{u.name}</p>
                <p className="text-sm text-muted-foreground">{u.email}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                    {u.role === "admin" ? "Admin" : "ผู้ใช้"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      u.kycStatus === "approved"
                        ? "border-green-300 text-green-700"
                        : u.kycStatus === "pending"
                        ? "border-yellow-300 text-yellow-700"
                        : "border-gray-200 text-gray-500"
                    }
                  >
                    KYC:{" "}
                    {u.kycStatus === "approved"
                      ? "ยืนยันแล้ว"
                      : u.kycStatus === "pending"
                      ? "รอ"
                      : "ยังไม่ยืนยัน"}
                  </Badge>
                  {u.isSeller && <Badge variant="outline" className="border-blue-300 text-blue-700">ผู้ขาย</Badge>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {u.role !== "admin" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateRole.mutate({ userId: u.id, role: "admin" })}
                    disabled={updateRole.isPending}
                  >
                    ให้สิทธิ์ Admin
                  </Button>
                )}
                {u.role === "admin" && u.id !== 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => updateRole.mutate({ userId: u.id, role: "user" })}
                    disabled={updateRole.isPending}
                  >
                    ถอนสิทธิ์
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const { data: settings, refetch } = trpc.admin.settings.useQuery();
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const updateSetting = trpc.admin.updateSetting.useMutation({
    onSuccess: () => { toast.success("บันทึกแล้ว"); refetch(); setEditKey(null); },
    onError: (err: any) => toast.error(err.message),
  });

  const SETTING_LABELS: Record<string, { label: string; desc: string }> = {
    site_name: { label: "ชื่อเว็บไซต์", desc: "ชื่อที่แสดงใน Navbar และ SEO" },
  };

  return (
    <div className="space-y-3 max-w-xl">
      <p className="text-sm text-muted-foreground">ตั้งค่าระบบ Marketplace</p>
      {settings?.map((s: any) => {
        const meta = SETTING_LABELS[s.key];
        return (
          <Card key={s.key}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="font-medium text-sm">{meta?.label ?? s.key}</p>
                  {meta?.desc && <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>}
                  {editKey === s.key ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 w-36"
                      />
                      <Button
                        size="sm"
                        onClick={() => updateSetting.mutate({ key: s.key, value: editValue })}
                        disabled={updateSetting.isPending}
                      >
                        บันทึก
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditKey(null)}>ยกเลิก</Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm mt-1 font-medium">{s.value}</p>
                  )}
                </div>
                {editKey !== s.key && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditKey(s.key); setEditValue(s.value); }}
                  >
                    แก้ไข
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
