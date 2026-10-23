import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMe } from '../api/profile';
import { API_BASE, clearToken, getToken } from '../api/client';

// Who is logged in, shared by the navbar, route guards and pages.
//
// The JWT already carries { id, team }, so "who am I" and "am I staff" are known
// instantly. role (admin) and photo come from GET /users/me, loaded once per login.

// Reads the payload of a JWT without verifying it. Only used to decide what to
// SHOW; the backend still checks the token on every request.
export function readToken(token = getToken()) {
  if (!token) return null;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

// Residents have no team; the backend stores "user" for them.
export const isResidentTeam = (team) => !team || team === 'user';

// Uploaded photos are stored as "uploads/<file>" on the backend.
export function photoUrl(photo) {
  if (!photo) return '/default-avatar.svg';
  if (/^(https?:|data:)/.test(photo)) return photo;
  return `${API_BASE}/${String(photo).replace(/^\/+/, '')}`;
}

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [token, setToken] = useState(getToken());
  const [user, setUser] = useState(null); // full profile from /users/me
  const [loadingUser, setLoadingUser] = useState(Boolean(getToken()));

  const claims = useMemo(() => readToken(token), [token]);

  useEffect(() => {
    if (!claims) {
      setUser(null);
      setLoadingUser(false);
      return undefined;
    }
    let cancelled = false;
    setLoadingUser(true);
    getMe()
      .then((me) => !cancelled && setUser(me))
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) {
          clearToken();
          setToken(null);
        }
        setUser(null);
      })
      .finally(() => !cancelled && setLoadingUser(false));
    return () => {
      cancelled = true;
    };
  }, [claims]);

  // Call after login/register (token was just saved) or logout (token cleared)
  const refresh = useCallback(() => setToken(getToken()), []);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
  }, []);

  const value = useMemo(() => {
    const loggedIn = Boolean(claims);
    const isAdmin = String(user?.role || '').toLowerCase() === 'admin';
    const isStaff = loggedIn && !isResidentTeam(claims?.team);
    // Team lead is not a role: it's the teams this person leads (from /users/me)
    const leads = (user?.leads || []).map((t) => t.name);
    const homeTeam = isStaff ? claims?.team : null;
    return {
      loggedIn,
      userId: claims?.id || null,
      team: claims?.team || null,
      user,
      loadingUser,
      isAdmin,
      isStaff,
      leads,
      isLead: leads.length > 0,
      // Teams whose schedule and tickets this person works with: home team first, then teams they lead
      myTeams: [...new Set([homeTeam, ...leads].filter(Boolean))],
      // Staff and admins work the team queue; residents use their profile
      canSeeQueue: isStaff || isAdmin,
      setUser,
      refresh,
      logout,
    };
  }, [claims, user, loadingUser, refresh, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

// Where someone lands after logging in
export const homePathFor = (token) =>
  isResidentTeam(readToken(token)?.team) ? '/profile' : '/incidents';
