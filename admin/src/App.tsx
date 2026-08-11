import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from './auth/AdminAuthContext';
import { RequireAdmin } from './auth/RequireAdmin';
import { AdminShell } from './layout/AdminShell';
import { DashboardPage } from './pages/DashboardPage';
import { HandbookPage } from './pages/HandbookPage';
import { ModerationPage } from './pages/ModerationPage';

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
            <Route path="moderation" element={<ModerationPage />} />
            <Route path="handbook" element={<HandbookPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AdminAuthProvider>
  );
}
