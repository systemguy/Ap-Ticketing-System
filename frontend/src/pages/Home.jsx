import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext';

function Home() {
  const { loggedIn, canSeeQueue, user } = useSession();

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Resident services</p>
        <h1>{loggedIn && user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Residence Ticketing'}</h1>
        <p className="lede">
          A quiet, orderly way for residents and staff to report and track
          maintenance matters across the property.
        </p>

        <div className="hero-actions">
          {loggedIn ? (
            <>
              <Link to="/tickets/new" className="btn">Create a Ticket</Link>
              <Link to="/profile" className="btn btn-outline">View My Incidents</Link>
              {canSeeQueue && <Link to="/incidents" className="text-link">Open the team queue →</Link>}
            </>
          ) : (
            <>
              <Link to="/login" className="btn">Login / Register</Link>
              <Link to="/services" className="btn btn-outline">See Our Services</Link>
            </>
          )}
        </div>
      </section>

      <section className="steps" aria-labelledby="how-it-works">
        <h2 id="how-it-works">How it works</h2>
        <ol className="step-list">
          <li>
            <span className="step-num">01</span>
            <h3>Report</h3>
            <p>Describe the issue, such as a leak or a broken fixture, and add a photo if it helps.</p>
          </li>
          <li>
            <span className="step-num">02</span>
            <h3>Track</h3>
            <p>Your ticket is routed to the right team, and every update appears on its timeline.</p>
          </li>
          <li>
            <span className="step-num">03</span>
            <h3>Resolve</h3>
            <p>Staff work the ticket until the matter is resolved, and it moves to your closed list.</p>
          </li>
        </ol>
      </section>
    </main>
  );
}

export default Home;
