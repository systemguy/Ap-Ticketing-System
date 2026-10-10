import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getToken } from '../api/client';

// Wrap any route that requires login. Pages still handle a 401 from the
// API (expired token) by clearing the token and redirecting.
export default function ProtectedRoute() {
  const location = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
