import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { photoUrl, useSession } from '../context/SessionContext';

function NavBar() {
  const { loggedIn, user, canSeeQueue, isAdmin, logout } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false); // mobile menu

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
        {isAdmin && <NavLink to="/admin">Admin</NavLink>}
        {loggedIn ? (
          <>
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
