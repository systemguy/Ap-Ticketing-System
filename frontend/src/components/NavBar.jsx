import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getToken, clearToken } from '../api/client';

function NavBar() {
  useLocation(); // re-render on every page change so the links match the login state
  const navigate = useNavigate();
  const loggedIn = Boolean(getToken());

  function logout() {
    clearToken();
    navigate('/login');
  }

  return (
    <div className="navbar">
      <Link to="/" className="logo">Residence Ticketing</Link>
      <div className="links">
        <Link to="/">Home</Link>
        <Link to="/services">Services</Link>
        <Link to="/incidents">Active Incidents</Link>
        {loggedIn ? (
          <>
            <Link to="/profile">Profile</Link>
            <button type="button" className="nav-button" onClick={logout}>Logout</button>
          </>
        ) : (
          <Link to="/login">Login / Register</Link>
        )}
      </div>
    </div>
  );
}

export default NavBar;
