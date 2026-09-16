import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:3000';



// placeholder data so the page shows something before the backend is connected
const placeholderIncidents = [
  { id: 'INC-1042', title: 'Leaking pipe under kitchen sink', unit: 'Bldg 3, Unit 214', status: 'open' },
  { id: 'INC-1041', title: 'Hallway light out on 2nd floor', unit: 'Bldg 1, 2nd floor', status: 'in-progress' },
  { id: 'INC-1038', title: 'AC unit not cooling', unit: 'Bldg 2, Unit 108', status: 'resolved' },
];

function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [description, setDescription] = useState('');
  const [team, setTeam] = useState('HVAC');
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    console.log('token: '  +token)
    if (!token) {
      setError('No authentication token found. Please log in.');
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/tickets`,{
      method: 'GET',
      headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `HTTP error ${res.status}`);
        }
        return res.json()})
      .then((data) => {
        console.log('Actual Backend Response:', data);
        if (data && Array.isArray(data.tickets)) {
          setIncidents(data.tickets);
        } else if (Array.isArray(data)) {
          setIncidents(data);
        }
      })
      .catch((err) => {
          console.log(err)
          setError(err.message);
          setLoading(false);
        // backend not connected yet, keep showing placeholder data
      });
  }, []);
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  function handleCreate(e) {
    e.preventDefault(); 
    const token = localStorage.getItem('token');
    const newIncident = {
      title,
      description,
      unit,
      team
    };

    fetch(`${API_URL}/tickets/create`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`,'Content-Type': 'application/json' },
      body: JSON.stringify(newIncident),
    }).catch((err) => {
        console.log(err)
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
             <div className="form-group">
              <label>Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <div className="form-group">
            <label>Department / Team</label>
            <select value={team} onChange={(e) => setTeam(e.target.value)} required>
              <option value="HVAC">HVAC</option>
              <option value="OIT">OIT (IT Services)</option>
              <option value="Plumbing">Plumbing</option>
              <option value="Electrical">Electrical</option>
              <option value="General Maintenance">General Maintenance</option>
            </select>
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
            <tr key={incident._id}>
              <td>{incident._id}</td>
              <td>{incident.title}</td>
              <td>{incident.unit}</td>
              <td>
                <span className={`Status: -${incident.resolved}`}>
                  {incident.resolved ? 'Resolved' : 'Open'}
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