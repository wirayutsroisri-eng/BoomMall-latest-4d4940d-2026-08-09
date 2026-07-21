import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDate, formatPrice } from "@shared/types";
import { ArrowDownLeft, ArrowUpRight, Plus, Wallet } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { prepareImageForUpload, type PreparedImageUpload, ImageUploadError } from "@/lib/imageUpload";

const TX_TYPE_LABELS: Record<string, string> = {
  topup: "เติมเงิน",
  escrow_hold: "หักชำระสินค้า",
  escrow_release: "รับเงินจากการขาย",
  payout: "ถอนเงิน",
  refund: "คืนเงิน",
  fee: "ค่าธรรมเนียม",
};

const TX_TYPE_COLORS: Record<string, string> = {
  topup: "text-green-600",
  escrow_hold: "text-red-600",
  escrow_release: "text-green-600",
  payout: "text-orange-600",
  refund: "text-blue-600",
  fee: "text-red-500",
};

export default function WalletPage() {
  const { isAuthenticated } = useAuth();
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [slipPrepared, setSlipPrepared] = useState<PreparedImageUpload | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: walletData, refetch: refetchWallet } = trpc.wallet.getBalance.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: transactions } = trpc.wallet.getTransactions.useQuery(
    { limit: 30, offset: 0 },
    { enabled: isAuthenticated }
  );

  const topupRequest = trpc.wallet.topupRequest.useMutation({
    onSuccess: () => {
      toast.success("อัปโหลดสลิปแล้ว รอ Admin ยืนยัน");
      setShowTopup(false);
      setTopupAmount("");
      setSlipPrepared(null);
      refetchWallet();
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleTopup() {
    if (!slipPrepared || !topupAmount) return;
    topupRequest.mutate({
      amount: parseFloat(topupAmount),
      slipBase64: slipPrepared.base64,
      slipFilename: slipPrepared.filename,
      slipContentType: slipPrepared.contentType,
    });
  }

  async function handleSlipSelect(file: File) {
    try {
      const prepared = await prepareImageForUpload(file);
      setSlipPrepared(prepared);
    } catch (err) {
      toast.error(err instanceof ImageUploadError ? err.message : "อัปโหลดสลิปไม่สำเร็จ");
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="container py-16 text-center">
        <Wallet className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold mb-2">กรุณาเข้าสู่ระบบ</h2>
        <Link href="/"><Button>กลับหน้าหลัก</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: "Prompt, sans-serif" }}>
          กระเป๋าเงิน
        </h1>

        {/* Balance Card */}
        <Card className="mb-6 bg-gradient-to-br from-primary to-primary/80 text-white border-0">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/70 text-sm mb-1">ยอดเงินคงเหลือ</p>
                <p className="text-4xl font-bold">
                  {walletData ? formatPrice(walletData.balance) : "฿0.00"}
                </p>
              </div>
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                <Wallet className="w-7 h-7 text-white" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                variant="secondary"
                size="sm"
                className="flex items-center gap-1.5 bg-white/20 text-white hover:bg-white/30 border-0"
                onClick={() => setShowTopup(true)}
              >
                <Plus className="w-4 h-4" />
                เติมเงิน
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* How to topup */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium text-blue-800 mb-1">วิธีเติมเงิน</p>
            <p className="text-xs text-blue-700">
              โอนเงินผ่าน PromptPay หรือธนาคาร แล้วแนบสลิปในระบบ Admin จะยืนยันและเติมเงินให้ภายใน 1 ชั่วโมง
            </p>
          </CardContent>
        </Card>

        {/* Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ประวัติธุรกรรม</CardTitle>
          </CardHeader>
          <CardContent>
            {!transactions || transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                ยังไม่มีธุรกรรม
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx: any) => {
                  const isCredit = ["topup", "escrow_release", "refund"].includes(tx.type);
                  return (
                    <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        isCredit ? "bg-green-100" : "bg-red-100"
                      }`}>
                        {isCredit
                          ? <ArrowDownLeft className="w-4 h-4 text-green-600" />
                          : <ArrowUpRight className="w-4 h-4 text-red-600" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{TX_TYPE_LABELS[tx.type] ?? tx.type}</p>
                        {tx.note && <p className="text-xs text-muted-foreground truncate">{tx.note}</p>}
                        <p className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</p>
                      </div>
                      <p className={`font-semibold text-sm shrink-0 ${TX_TYPE_COLORS[tx.type] ?? ""}`}>
                        {isCredit ? "+" : "-"}{formatPrice(tx.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Topup Dialog */}
      <Dialog open={showTopup} onOpenChange={setShowTopup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เติมเงินเข้า Wallet</DialogTitle>
            <DialogDescription>
              โอนเงินแล้วแนบสลิปเพื่อให้ Admin ยืนยัน
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted rounded-lg p-3 text-sm">
              <p className="font-medium mb-1">ข้อมูลการโอนเงิน</p>
              <p className="text-muted-foreground">PromptPay: <span className="font-mono font-medium text-foreground">0xx-xxx-xxxx</span></p>
              <p className="text-muted-foreground">ชื่อบัญชี: SecondHand Marketplace</p>
            </div>
            <div>
              <Label>จำนวนเงินที่โอน (บาท)</Label>
              <Input
                type="number"
                placeholder="100"
                min={10}
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>แนบสลิปการโอนเงิน</Label>
              <div
                className="mt-1 border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {slipPrepared ? (
                  <p className="text-sm text-foreground">{slipPrepared.filename}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">คลิกเพื่อเลือกรูปสลิป</p>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleSlipSelect(file);
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTopup(false)}>ยกเลิก</Button>
            <Button
              onClick={handleTopup}
              disabled={!topupAmount || !slipPrepared || topupRequest.isPending}
            >
              {topupRequest.isPending ? "กำลังส่ง..." : "ส่งสลิป"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
