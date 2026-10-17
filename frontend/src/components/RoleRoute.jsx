import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '../context/SessionContext';

// Nest inside <ProtectedRoute> (which already handles "not logged in").
//   <RoleRoute allow="queue" /> staff and admins; residents go to their profile
//   <RoleRoute allow="admin" /> admins only
// Hiding a page is a convenience, not security: the backend decides what data each user gets.
export default function RoleRoute({ allow }) {
  const { canSeeQueue, isAdmin, loadingUser } = useSession();

  // Admin status comes from /users/me; wait for it instead of bouncing an admin away
  if (loadingUser && (allow === 'admin' || !canSeeQueue)) {
    return <main className="page"><p className="muted">Loading…</p></main>;
  }

  const allowed = allow === 'admin' ? isAdmin : canSeeQueue;
  return allowed ? <Outlet /> : <Navigate to="/profile" replace />;
}
