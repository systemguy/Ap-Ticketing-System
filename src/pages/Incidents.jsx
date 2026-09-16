import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:4000';

// placeholder data so the page shows something before the backend is connected
const placeholderIncidents = [
  { id: 'INC-1042', title: 'Leaking pipe under kitchen sink', unit: 'Bldg 3, Unit 214', status: 'open' },
  { id: 'INC-1041', title: 'Hallway light out on 2nd floor', unit: 'Bldg 1, 2nd floor', status: 'in-progress' },
  { id: 'INC-1038', title: 'AC unit not cooling', unit: 'Bldg 2, Unit 108', status: 'resolved' },
];

function Incidents() {
  const [incidents, setIncidents] = useState(placeholderIncidents);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/incidents`)
      .then((res) => res.json())
      .then((data) => setIncidents(data))
      .catch(() => {
        // backend not connected yet, keep showing placeholder data
      });
  }, []);

  function handleCreate(e) {
    e.preventDefault();

    const newIncident = {
      id: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
      title,
      unit,
      status: 'open',
    };

    fetch(`${API_URL}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newIncident),
    }).catch(() => {
      // backend not connected yet, still show it locally
    });

    setIncidents([newIncident, ...incidents]);
    setTitle('');
    setUnit('');
    setShowForm(false);
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Active Incidents</h1>
        <button className="btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Create Ticket'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Issue</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Location</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} required />
            </div>
            <button type="submit" className="btn">Submit Ticket</button>
          </form>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Issue</th>
            <th>Location</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => (
            <tr key={incident.id}>
              <td>{incident.id}</td>
              <td>{incident.title}</td>
              <td>{incident.unit}</td>
              <td>
                <span className={`status status-${incident.status}`}>
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
