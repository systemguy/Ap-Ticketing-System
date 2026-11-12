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
import SchedulePage from './pages/schedule/SchedulePage';
import EscalationPage from './pages/escalation/EscalationPage';
import NotificationsPage from './pages/NotificationsPage';
import PerformancePage from './pages/PerformancePage';

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
          <Route path="/notifications" element={<NotificationsPage />} />
          {/* Uptime and speed (for team leads and admins) */}
          <Route path="/performance" element={<PerformancePage />} />

          {/* Staff and admins only. Residents see their incidents on their profile. */}
          <Route element={<RoleRoute allow="queue" />}>
            <Route path="/incidents" element={<Incidents />} />
            {/* On-call calendar, one page per team. Leads (and admins) can add and change shifts. */}
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/schedule/:team" element={<SchedulePage />} />
            {/* Escalation policy per team: who gets an unacknowledged ticket, and when. Leads (and admins) edit it. */}
            <Route path="/escalation" element={<EscalationPage />} />
            <Route path="/escalation/:team" element={<EscalationPage />} />
          </Route>

          {/* Admins only */}
          <Route element={<RoleRoute allow="admin" />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
