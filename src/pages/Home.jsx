import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="page">
      <h1>AP Ticketing System</h1>
      <p>
        This is a system for residents and staff to report and track maintenance
        issues in the apartment community.
      </p>

      <div>
        <Link to="/login" className="btn">Login / Register</Link>
        <Link to="/incidents" className="btn btn-outline">View Active Incidents</Link>
      </div>

      <div className="card" style={{ marginTop: '30px' }}>
        <h3>How it works</h3>
        <ul>
          <li>Residents report an issue (like a leak or broken light).</li>
          <li>The issue is saved as a ticket with a status.</li>
          <li>Staff can update the ticket until it's resolved.</li>
        </ul>
      </div>
    </div>
  );
}

export default Home;
