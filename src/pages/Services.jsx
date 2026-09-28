import { Link } from 'react-router-dom';
import { departmentServices } from '../data/services';

function Services() {
  return (
    <div className="page">
      <h1>Services</h1>
      <p>
        Every ticket is routed to a department. Here is what each department
        handles, so you can pick the right one when reporting an issue.
      </p>

      {Object.entries(departmentServices).map(([department, services]) => (
        <div className="card" key={department}>
          <h3>{department}</h3>
          <ul className="service-list">
            {services.map((service) => (
              <li key={service}>{service}</li>
            ))}
          </ul>
        </div>
      ))}

      <Link to="/incidents" className="btn">Report an Issue</Link>
    </div>
  );
}

export default Services;
