import { NavLink } from 'react-router-dom';
import './Admin.css';

// Shared header for the admin pages: title, sub-navigation and the demo-data notice.
export default function AdminLayout({ title, intro, children }) {
  return (
    <main className="page page-wide admin">
      <p className="eyebrow">Admin</p>
      <h1>{title}</h1>
      {intro && <p className="lede">{intro}</p>}

      <nav className="admin-tabs" aria-label="Admin sections">
        <NavLink to="/admin" end>Overview</NavLink>
        <NavLink to="/admin/schedule">Scheduling</NavLink>
        <NavLink to="/admin/calendar">Shift calendar</NavLink>
      </nav>

      <p className="admin-notice">
        Preview: shifts are saved in this browser and the staff list is sample data until the
        scheduling API is built in Sprint 3.
      </p>

      {children}
    </main>
  );
}
