import { Link } from 'react-router-dom';

function Home() {
  const isLoggedIn = localStorage.getItem('loggedIn') === 'true';

  return (
    <div className="page">
      <h1>Residence Ticketing</h1>
      <p>
        A quiet, orderly way for residents and staff to report and track
        maintenance matters across the property.
      </p>

      <div>
        {!isLoggedIn && (
          <Link to="/login" className="btn">Login / Register</Link>
        )}
        <Link to="/incidents" className="btn btn-outline">View Active Incidents</Link>
      </div>

      <div className="card" style={{ marginTop: '40px' }}>
        <h3>How it works</h3>
        <ul>
          <li>Residents report an issue, such as a leak or a broken fixture.</li>
          <li>The issue is logged as a ticket with a clear status.</li>
          <li>Staff update the ticket until the matter is resolved.</li>
        </ul>
      </div>
    </div>
  );
}

export default Home;
