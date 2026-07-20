import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatDate, formatPrice, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@shared/types";
import { Package, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";

export default function OrdersPage() {
  const { isAuthenticated } = useAuth();

  const { data: purchasesData } = trpc.orders.myPurchases.useQuery(
    { limit: 50, offset: 0, status: "all" },
    { enabled: isAuthenticated }
  );
  const { data: salesData } = trpc.orders.mySales.useQuery(
    { limit: 50, offset: 0, status: "all" },
    { enabled: isAuthenticated }
  );

  const purchases = purchasesData?.items ?? [];
  const sales = salesData?.items ?? [];

  if (!isAuthenticated) {
    return (
      <div className="container py-16 text-center">
        <ShoppingBag className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold mb-2">กรุณาเข้าสู่ระบบ</h2>
        <Link href="/"><Button>กลับหน้าหลัก</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: "Prompt, sans-serif" }}>
          คำสั่งซื้อของฉัน
        </h1>

        <Tabs defaultValue="purchases">
          <TabsList className="mb-6">
            <TabsTrigger value="purchases">
              ซื้อ ({purchasesData?.counts.all ?? 0})
            </TabsTrigger>
            <TabsTrigger value="sales">
              ขาย ({salesData?.counts.all ?? 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="purchases">
            <OrderList orders={purchases} emptyText="ยังไม่มีคำสั่งซื้อ" />
          </TabsContent>
          <TabsContent value="sales">
            <OrderList orders={sales} emptyText="ยังไม่มีรายการขาย" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function OrderList({ orders, emptyText }: { orders: any[]; emptyText: string }) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <Link key={order.id} href={`/orders/${order.id}`}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {order.productImage ? (
                  <img
                    src={order.productImage}
                    alt={order.productTitle}
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center shrink-0">
                    <Package className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{order.productTitle}</p>
                  <p className="text-primary font-bold">{formatPrice(order.amount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                </div>
                <div className="shrink-0">
                  <Badge className={ORDER_STATUS_COLORS[order.status as keyof typeof ORDER_STATUS_COLORS] ?? "bg-gray-100 text-gray-800"}>
                    {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
