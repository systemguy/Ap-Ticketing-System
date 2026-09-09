import { Link } from 'react-router-dom';

function NavBar() {
  return (
    <div className="navbar">
      <Link to="/" className="logo">AP Ticketing System</Link>
      <div className="links">
        <Link to="/">Home</Link>
        <Link to="/login">Login / Register</Link>
        <Link to="/incidents">Active Incidents</Link>
      </div>
    </div>
  );
}

export default NavBar;
