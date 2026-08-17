import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthContext';
import { LoginScreen } from './LoginScreen';
import { canAccessPath, homeForSession } from './access';

/** Gate: any valid desk code may enter Admin OS; pages filter by nav. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { ready, signedIn, session } = useAdminAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[#122820]/70">
        กำลังตรวจสอบสิทธิ์…
      </div>
    );
  }

  if (!signedIn || !session) {
    return <LoginScreen redirectTo={location.pathname} />;
  }

  if (!canAccessPath(session, location.pathname)) {
    return <Navigate to={homeForSession(session)} replace />;
  }

  return <>{children}</>;
}
