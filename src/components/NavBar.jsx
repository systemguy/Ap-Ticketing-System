import { Link, useNavigate } from 'react-router-dom';

function NavBar() {
  const navigate = useNavigate();
  const isLoggedIn = localStorage.getItem('loggedIn') === 'true';

  function handleLogout() {
    localStorage.removeItem('loggedIn');
    navigate('/');
  }

  return (
    <div className="navbar">
      <Link to="/" className="logo">Residence Ticketing</Link>
      <div className="links">
        <Link to="/">Home</Link>
        <Link to="/incidents">Active Incidents</Link>
        {isLoggedIn ? (
          <a href="#" onClick={handleLogout}>Logout</a>
        ) : (
          <Link to="/login">Login / Register</Link>
        )}
      </div>
    </div>
  );
}

export default NavBar;
