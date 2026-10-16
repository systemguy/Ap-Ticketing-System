import { Link } from 'react-router-dom';
import { departmentServices, serviceLabel } from '../data/services';
import { useSession } from '../context/SessionContext';

function Services() {
  const { loggedIn } = useSession();

  return (
    <main className="page">
      <p className="eyebrow">Departments</p>
      <h1>Services</h1>
      <p className="lede">
        Every ticket is routed to a department. Here is what each department
        handles, so you can pick the right one when reporting an issue.
      </p>

      <div className="service-grid">
        {Object.entries(departmentServices).map(([department, services]) => (
          <div className="card service-card" key={department}>
            <h3>{department}</h3>
            <ul className="service-list">
              {services.map((service) => (
                <li key={service}>{serviceLabel(service)}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Link to={loggedIn ? '/tickets/new' : '/login'} className="btn">Report an Issue</Link>
    </main>
  );
}

export default Services;
