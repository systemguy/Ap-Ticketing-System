import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:4000';

// matches the departments and services set up in the database
const departmentServices = {
  HVAC: ['ac repair', 'ac test'],
  Plumbing: ['pipe repairs', 'infiltration repairs'],
  Electrical: ['wiring fixes', 'lighting repairs'],
};

const departments = Object.keys(departmentServices);

// placeholder data so the page shows something before the backend is connected
const placeholderIncidents = [
  { id: 'INC-1042', title: 'Leaking pipe under kitchen sink', unit: 'Bldg 3, Unit 214', status: 'open' },
  { id: 'INC-1041', title: 'Hallway light out on 2nd floor', unit: 'Bldg 1, 2nd floor', status: 'in-progress' },
  { id: 'INC-1038', title: 'AC unit not cooling', unit: 'Bldg 2, Unit 108', status: 'resolved' },
];

function Incidents() {
  const [incidents, setIncidents] = useState(placeholderIncidents);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [department, setDepartment] = useState(departments[0]);
  const [service, setService] = useState(departmentServices[departments[0]][0]);

  useEffect(() => {
    fetch(`${API_URL}/incidents`)
      .then((res) => res.json())
      .then((data) => setIncidents(data))
      .catch(() => {
        // backend not connected yet, keep showing placeholder data
      });
  }, []);

  function handleDepartmentChange(newDepartment) {
    setDepartment(newDepartment);
    setService(departmentServices[newDepartment][0]);
  }

  function openCreateForm() {
    setEditingId(null);
    setTitle('');
    setUnit('');
    setDepartment(departments[0]);
    setService(departmentServices[departments[0]][0]);
    setShowForm(true);
  }

  function openEditForm(incident) {
    setEditingId(incident.id);
    setTitle(incident.title);
    setUnit(incident.unit);
    const dept = incident.department || departments[0];
    setDepartment(dept);
    setService(incident.service || departmentServices[dept][0]);
    setShowForm(true);
  }

  function handleDelete(id) {
    fetch(`${API_URL}/incidents/${id}`, { method: 'DELETE' }).catch(() => {
      // backend not connected yet, still remove it locally
    });
    setIncidents(incidents.filter((incident) => incident.id !== id));
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (editingId) {
      // editing an existing incident
      const updated = { title, unit, department, service };

      fetch(`${API_URL}/incidents/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {
        // backend not connected yet, still update it locally
      });

      setIncidents(
        incidents.map((incident) =>
          incident.id === editingId ? { ...incident, ...updated } : incident
        )
      );
    } else {
      // creating a new incident
      const newIncident = {
        id: `INC-${Math.floor(1000 + Math.random() * 9000)}`,
        title,
        unit,
        department,
        service,
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
    }

    setShowForm(false);
    setEditingId(null);
    setTitle('');
    setUnit('');
    setDepartment(departments[0]);
    setService(departmentServices[departments[0]][0]);
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Active Incidents</h1>
        <button className="btn" onClick={showForm ? () => setShowForm(false) : openCreateForm}>
          {showForm ? 'Cancel' : 'Create Ticket'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Issue</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Location</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Department / Team</label>
              <select value={department} onChange={(e) => handleDepartmentChange(e.target.value)}>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Service</label>
              <select value={service} onChange={(e) => setService(e.target.value)}>
                {departmentServices[department].map((svc) => (
                  <option key={svc} value={svc}>{svc}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn">
              {editingId ? 'Save Changes' : 'Submit Ticket'}
            </button>
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
            <th>Actions</th>
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
              <td>
                <button className="btn btn-outline btn-small" onClick={() => openEditForm(incident)}>
                  Edit
                </button>
                <button className="btn btn-outline btn-small" onClick={() => handleDelete(incident.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Incidents;
