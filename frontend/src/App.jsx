import { Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Incidents from './pages/Incidents';
import Services from './pages/Services';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import ProfilePage from './pages/ProfilePage';
import IncidentTimelinePage from './pages/IncidentTimelinePage';
import NewTicketPage from './pages/NewTicketPage';
import AdminPage from './pages/admin/AdminPage';
import AdminSchedulePage from './pages/admin/AdminSchedulePage';
import AdminCalendarPage from './pages/admin/AdminCalendarPage';

function App() {
  return (
    <div className="app-shell">
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/login" element={<Auth />} />

        {/* Any logged-in user */}
        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/tickets/new" element={<NewTicketPage />} />
          <Route path="/incidents/:id/timeline" element={<IncidentTimelinePage />} />

          {/* Staff and admins only. Residents see their incidents on their profile. */}
          <Route element={<RoleRoute allow="queue" />}>
            <Route path="/incidents" element={<Incidents />} />
          </Route>

          {/* Admins only */}
          <Route element={<RoleRoute allow="admin" />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/schedule" element={<AdminSchedulePage />} />
            <Route path="/admin/calendar" element={<AdminCalendarPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
