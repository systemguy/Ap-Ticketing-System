import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import Auth from './pages/Auth';
import Incidents from './pages/Incidents';
import Services from './pages/Services';

function App() {
  return (
    <div>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/incidents" element={<Incidents />} />
      </Routes>
    </div>
  );
}

export default App;
