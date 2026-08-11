import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthContext';
import { LoginScreen } from './LoginScreen';

/** Gate: only authenticated ADMIN may enter the portal (incl. handbook). */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { ready, isAdmin, session } = useAdminAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[#122820]/70">
        กำลังตรวจสอบสิทธิ์ ADMIN…
      </div>
    );
  }

  if (!session || !isAdmin) {
    return <LoginScreen redirectTo={location.pathname} />;
  }

  if (location.pathname.includes('handbook') && !session.permissions.handbook) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
