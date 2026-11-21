import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '../context/SessionContext';

// Nest inside <ProtectedRoute> (which already handles "not logged in").
//   <RoleRoute allow="queue" /> staff and admins; residents go to their profile
//   <RoleRoute allow="incidents" /> staff, admins and auditors (auditors get the read-only view)
//   <RoleRoute allow="admin" /> admins only
// Hiding a page is a convenience, not security: the backend decides what data each user gets.
export default function RoleRoute({ allow }) {
  const { canSeeQueue, canSeeIncidents, isAdmin, loadingUser } = useSession();

  // Admin and auditor status come from /users/me; wait for it instead of bouncing them away
  if (loadingUser && (allow === 'admin' || !canSeeQueue)) {
    return <main className="page"><p className="muted">Loading…</p></main>;
  }

  const allowed = allow === 'admin' ? isAdmin : allow === 'incidents' ? canSeeIncidents : canSeeQueue;
  return allowed ? <Outlet /> : <Navigate to="/profile" replace />;
}
