import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Incidents from './pages/Incidents';
import Services from './pages/Services';
import ProtectedRoute from './components/ProtectedRoute';
import ProfilePage from './pages/ProfilePage';
import IncidentTimelinePage from './pages/IncidentTimelinePage';

function App() {
  return (
    <div>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/login" element={<Auth />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/incidents/:id/timeline" element={<IncidentTimelinePage />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
