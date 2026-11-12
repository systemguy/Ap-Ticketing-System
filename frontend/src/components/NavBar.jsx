import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { photoUrl, useSession } from '../context/SessionContext';
import { NOTIFICATIONS_CHANGED, unreadCount } from '../api/notifications';

// Unread notifications for the logged-in user, checked every 30 seconds and right after
// something on the page marks them read
function useUnread(loggedIn, pathname) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!loggedIn) {
      setUnread(0);
      return undefined;
    }
    let cancelled = false;
    const check = () => unreadCount().then((n) => !cancelled && setUnread(n)).catch(() => {});
    check();
    const t = setInterval(check, 30 * 1000);
    window.addEventListener(NOTIFICATIONS_CHANGED, check);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener(NOTIFICATIONS_CHANGED, check);
    };
  }, [loggedIn, pathname]);
  return unread;
}

function NavBar() {
  const { loggedIn, user, canSeeQueue, isAdmin, isLead, logout } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false); // mobile menu
  const unread = useUnread(loggedIn, location.pathname);

  // Close the mobile menu after navigating
  useEffect(() => setOpen(false), [location.pathname]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const name = user?.name || 'Your profile';

  return (
    <header className="navbar">
      <Link to="/" className="logo">Residence Ticketing</Link>

      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="main-nav"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Close' : 'Menu'}
      </button>

      <nav id="main-nav" className={`links ${open ? 'links-open' : ''}`} aria-label="Main">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/services">Services</NavLink>
        {loggedIn && <NavLink to="/tickets/new">Report an Issue</NavLink>}
        {canSeeQueue && <NavLink to="/incidents">Team Queue</NavLink>}
        {canSeeQueue && <NavLink to="/schedule">Schedule</NavLink>}
        {canSeeQueue && <NavLink to="/escalation">Escalation</NavLink>}
        {(isAdmin || isLead) && <NavLink to="/performance">Performance</NavLink>}
        {isAdmin && <NavLink to="/admin">Admin</NavLink>}
        {loggedIn ? (
          <>
            <NavLink
              to="/notifications"
              className="nav-bell"
              aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
              title="Notifications"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
              </svg>
              <span className="nav-bell-label">Notifications</span>
              {unread > 0 && <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>}
            </NavLink>
            <button type="button" className="nav-button" onClick={handleLogout}>Logout</button>
            {/* Profile picture doubles as the link to the profile page */}
            <Link to="/profile" className="nav-avatar" title={name} aria-label={`${name} – open profile`}>
              <img
                src={photoUrl(user?.photo)}
                alt=""
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = '/default-avatar.svg';
                }}
              />
              <span className="nav-avatar-label">My profile</span>
            </Link>
          </>
        ) : (
          <NavLink to="/login">Login / Register</NavLink>
        )}
      </nav>
    </header>
  );
}

export default NavBar;
