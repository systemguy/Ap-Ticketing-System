import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:3000'; // Set your Express backend port

// matches the departments and services set up in the database
const departmentServices = {
  HVAC: ['ac repair', 'ac test'],
  Plumbing: ['pipe repairs', 'infiltration repairs'],
  Electrical: ['wiring fixes', 'lighting repairs'],
  OIT: ['network setup', 'hardware fix'],
};

const departments = Object.keys(departmentServices);

function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [department, setDepartment] = useState(departments[0]);
  const [service, setService] = useState(departmentServices[departments[0]][0]);

  // Fetch tickets from database on mount & filter out resolved ones
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${API_URL}/tickets`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then((res) => res.json())
      .then((data) => {
        let ticketArray = [];
        if (data?.tickets && Array.isArray(data.tickets)) {
          ticketArray = data.tickets;
        } else if (Array.isArray(data)) {
          ticketArray = data;
        }

        // 👈 Filter out any tickets where resolved === true
        const activeTickets = ticketArray.filter((ticket) => !ticket.resolved);
        console.log(activeTickets)
        setIncidents(activeTickets);
      })
      .catch((err) => {
        console.error('Error loading tickets:', err);
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
    setEditingId(incident._id);
    setTitle(incident.title || '');
    setUnit(incident.unit || '');
    const dept = incident.team || departments[0];
    setDepartment(dept);
    setService(incident.type || departmentServices[dept]?.[0] || '');
    setShowForm(true);
  }

  function handleDelete(id) {
    const token = localStorage.getItem('token');

    fetch(`${API_URL}/tickets/delete/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ resolved: true }),
    }).catch((err) => console.error(err));

    // Remove resolved ticket from display immediately
    setIncidents(incidents.filter((incident) => incident._id !== id));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const token = localStorage.getItem('token');

    const payload = {
      title,
      unit,
      description: title, // Satisfies description requirement
      team: department,
      type: service,
    };

    if (editingId) {
      // editing an existing incident
      console.log(token)
      fetch(`${API_URL}/tickets/update/${editingId}`, {
        
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).catch((err) => console.error(err));

      setIncidents(
        incidents.map((incident) =>
          incident._id === editingId ? { ...incident, ...payload } : incident
        )
      );
    } else {
      // creating a new incident
      try {
        const res = await fetch(`${API_URL}/tickets/create`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok) {
          const newTicket = data.ticket || data;
          setIncidents([newTicket, ...incidents]);
        } else {
          const errText = Array.isArray(data.error) ? data.error.join(', ') : data.error;
          alert(errText || 'Failed to create ticket');
        }
      } catch (err) {
        console.error(err);
      }
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
                {(departmentServices[department] || []).map((svc) => (
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
            <th>Type</th>
            <th>Location</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => {
            const statusLabel = incident.status || 'open';
            return (
              <tr key={incident._id}>
                <td>{incident._id ? incident._id.slice(-6).toUpperCase() : incident.id}</td>
                <td>{incident.title}</td>
                <td>{incident.type}</td>
                <td>{incident.unit}</td>
                <td>
                  <span className={`status status-${statusLabel}`}>
                    {statusLabel}
                  </span>
                </td>
                <td>
                  <button className="btn btn-outline btn-small" onClick={() => openEditForm(incident)}>
                    Edit
                  </button>
                  <button className="btn btn-outline btn-small" onClick={() => handleDelete(incident._id)}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default Incidents;