import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from './auth/AdminAuthContext';
import { RequireAdmin } from './auth/RequireAdmin';
import { AdminShell } from './layout/AdminShell';
import { DashboardPage } from './pages/DashboardPage';
import { FeedAlgorithmPage } from './pages/FeedAlgorithmPage';
import { AdsPage } from './pages/AdsPage';
import { AiControlPage } from './pages/Placeholders';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ContentPage } from './pages/ContentPage';
import { UsersPage } from './pages/UsersPage';
import { BoardPage } from './pages/BoardPage';
import { SellersPage } from './pages/SellersPage';
import { PlatformFinancePage } from './pages/PlatformFinancePage';
import { ShopChatPage } from './pages/ShopChatPage';
import { DomainsPage } from './pages/DomainsPage';
import { SettingsPage } from './pages/SettingsPage';
import { OrdersPage } from './pages/OrdersPage';
import { BoomCoinPage } from './pages/BoomCoinPage';
import { AlertsPage } from './pages/AlertsPage';
import { SystemHealthPage } from './pages/SystemHealthPage';
import { SafetyLayout } from './pages/safety/SafetyLayout';
import { SafetyOverviewPage } from './pages/safety/SafetyOverviewPage';
import { SafetyReportsPage } from './pages/safety/SafetyReportsPage';
import { SafetyCasesPage } from './pages/safety/SafetyCasesPage';
import { SafetyUsersPage } from './pages/safety/SafetyUsersPage';
import { SafetyUserProfilePage } from './pages/safety/SafetyUserProfilePage';
import { SafetyContentPage } from './pages/safety/SafetyContentPage';
import {
  SafetyAppealsPage,
  SafetyAuditPage,
  SafetyAutoModPage,
  SafetyBlacklistPage,
  SafetyPolicyPage,
} from './pages/safety/SafetyOpsPages';
import { SafetyAlgorithmPage } from './pages/safety/SafetyAlgorithmPage';
import { ChatLayout } from './pages/chat/ChatLayout';
import { ChatDashboardPage } from './pages/chat/ChatDashboardPage';
import { ChatReportsPage } from './pages/chat/ChatReportsPage';
import { ChatPolicyPage } from './pages/chat/ChatPolicyPage';
import { ChatDeliveryPage } from './pages/chat/ChatDeliveryPage';
import {
  ChatAnalyticsPage,
  ChatAntiSpamPage,
  ChatBlocksPage,
  ChatEmergencyPage,
  ChatNotificationsPage,
  ChatRealtimePage,
  ChatRestrictionsPage,
} from './pages/chat/ChatOpsPages';

export default function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter basename="/admin">
        <Routes>
          <Route
            element={
              <RequireAdmin>
                <AdminShell />
              </RequireAdmin>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="health" element={<SystemHealthPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="board" element={<BoardPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="feed" element={<FeedAlgorithmPage />} />
            <Route path="ads" element={<AdsPage />} />
            <Route path="promotions" element={<AdsPage />} />

            <Route path="safety" element={<SafetyLayout />}>
              <Route index element={<SafetyOverviewPage />} />
              <Route path="reports" element={<SafetyReportsPage />} />
              <Route path="cases" element={<SafetyCasesPage />} />
              <Route path="users" element={<SafetyUsersPage />} />
              <Route path="users/:userId" element={<SafetyUserProfilePage />} />
              <Route path="content" element={<SafetyContentPage />} />
              <Route path="automod" element={<SafetyAutoModPage />} />
              <Route path="algorithm" element={<SafetyAlgorithmPage />} />
              <Route path="policy" element={<SafetyPolicyPage />} />
              <Route path="blacklist" element={<SafetyBlacklistPage />} />
              <Route path="appeals" element={<SafetyAppealsPage />} />
              <Route path="audit" element={<SafetyAuditPage />} />
              <Route path="chat" element={<ChatLayout />}>
                <Route index element={<ChatDashboardPage />} />
                <Route path="reports" element={<ChatReportsPage />} />
                <Route path="policy" element={<ChatPolicyPage />} />
                <Route path="delivery" element={<ChatDeliveryPage />} />
                <Route path="realtime" element={<ChatRealtimePage />} />
                <Route path="notifications" element={<ChatNotificationsPage />} />
                <Route path="antispam" element={<ChatAntiSpamPage />} />
                <Route path="blocks" element={<ChatBlocksPage />} />
                <Route path="restrictions" element={<ChatRestrictionsPage />} />
                <Route path="analytics" element={<ChatAnalyticsPage />} />
                <Route path="emergency" element={<ChatEmergencyPage />} />
              </Route>
            </Route>

            {/* legacy redirects */}
            <Route path="chat/*" element={<Navigate to="/safety/chat" replace />} />
            <Route path="moderation" element={<Navigate to="/safety" replace />} />

            <Route path="sellers" element={<SellersPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="finance" element={<PlatformFinancePage />} />
            <Route path="coins" element={<BoomCoinPage />} />
            <Route path="cases" element={<Navigate to="/safety/cases" replace />} />
            <Route path="shop-chat" element={<ShopChatPage />} />
            <Route path="domains" element={<DomainsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="ai" element={<AiControlPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="handbook" element={<Navigate to="/finance" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AdminAuthProvider>
  );
}
