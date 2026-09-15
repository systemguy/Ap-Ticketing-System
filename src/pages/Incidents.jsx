import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:3000';

// placeholder data so the page shows something before the backend is connected
const placeholderIncidents = [
  { id: 'INC-1042', title: 'Leaking pipe under kitchen sink', unit: 'Bldg 3, Unit 214', status: 'open' },
  { id: 'INC-1041', title: 'Hallway light out on 2nd floor', unit: 'Bldg 1, 2nd floor', status: 'in-progress' },
  { id: 'INC-1038', title: 'AC unit not cooling', unit: 'Bldg 2, Unit 108', status: 'resolved' },
];

function Incidents() {
  const [incidents, setIncidents] = useState(placeholderIncidents);

  useEffect(() => {
    fetch(`${API_URL}/tickets`)
      .then((res) => res.json())
      .then((data) => setIncidents(data))
      .catch(() => {
        // backend not connected yet, keep showing placeholder data
      });
  }, []);

  return (
    <div className="page">
      <h1>Active Incidents</h1>

      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Issue</th>
            <th>Location</th>
            <th>Team</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => (
            <tr key={incident.id}>
              <td>{incident.id}</td>
              <td>{incident.title}</td>
              <td>{incident.unit}</td>
              <td>{incident.team}</td>
              <td>
                
                <span className={`Resolved: -${incident.resolved}`}> 
                  {incident.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Incidents;
