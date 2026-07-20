import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import ScrollMemory from "./components/ScrollMemory";
import Navbar from "./components/Navbar";
import BottomNav from "./components/BottomNav";
import Home from "./pages/Home";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Sell from "./pages/Sell";
import KYC from "./pages/KYC";
import SellerDashboard from "./pages/SellerDashboard";
import Admin from "./pages/Admin";
import Profile from "./pages/Profile";
import CartPage from "@/pages/Cart";
import CheckoutPage from "@/pages/Checkout";
import ChatsPage from "@/pages/Chats";
import ChatPage from "@/pages/Chat";
import SellerOrdersPage from "@/pages/SellerOrders";
import SellerStore from "@/pages/SellerStore";
import MyOrdersPage from "@/pages/MyOrders";
import OrderDetailPage from "@/pages/OrderDetail";
import PaymentSettingsPage from "@/pages/PaymentSettings";
import TrackingDetailPage from "@/pages/TrackingDetail";
import { PushNotificationPrompt } from "./components/PushNotificationPrompt";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/products" component={Products} />
      <Route path="/products/:id" component={ProductDetail} />
      <Route path="/sell" component={Sell} />
      <Route path="/kyc" component={KYC} />
      <Route path="/seller/dashboard" component={SellerDashboard} />
      <Route path="/seller/orders" component={SellerOrdersPage} />
      <Route path="/admin" component={Admin} />
      <Route path="/profile" component={Profile} />
      <Route path="/cart" component={CartPage} />
      <Route path="/checkout/:id" component={CheckoutPage} />
      <Route path="/chats" component={ChatsPage} />
      <Route path="/chat/:id" component={ChatPage} />
      <Route path="/shop/:userId" component={SellerStore} />
      <Route path="/my-orders" component={MyOrdersPage} />
      <Route path="/orders/:id" component={OrderDetailPage} />
      <Route path="/payment-settings" component={PaymentSettingsPage} />
      <Route path="/tracking/:orderId" component={TrackingDetailPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  const isHomeFeed = location === "/";

  return (
    <>
      {!isHomeFeed && (
        <div className="hidden md:block">
          <Navbar />
        </div>
      )}
      <div className={isHomeFeed ? "" : "pb-16 md:pb-0"}>
        <Router />
      </div>
      <div className="md:hidden">
        <BottomNav />
      </div>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <ScrollMemory />
          <PushNotificationPrompt />
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
