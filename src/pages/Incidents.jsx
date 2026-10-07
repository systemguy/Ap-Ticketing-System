import { useState, useEffect, useCallback } from 'react';
import { departmentServices, departments } from '../data/services';
import { SEVERITIES, severityOf } from '../data/severity';
import { API_BASE, errorText } from '../api/client';

// The backend stores only the service, so find its department for the edit form.
function departmentOf(service) {
  return departments.find((d) => departmentServices[d].includes(service)) || departments[0];
}

// The backend populates userPosted with { name, email } when it lists tickets.
// Fall back gracefully if it is missing (e.g. the account was removed).
function getReporter(incident) {
  const poster = incident.userPosted;
  if (poster && typeof poster === 'object') {
    return {
      name: poster.name || poster.email || 'Unknown',
      email: poster.name ? poster.email : '',
    };
  }
  return { name: 'Unknown', email: '' };
}

function authHeaders() {
  return {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  };
}

function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState(departments[0]);
  const [service, setService] = useState(departmentServices[departments[0]][0]);
  const [severity, setSeverity] = useState('');
  const [minSeverity, setMinSeverity] = useState(0); // list filter, 0 = all
  const [deleteTarget, setDeleteTarget] = useState(null); // ticket waiting on delete confirmation
  const [deleting, setDeleting] = useState(false);

  // Fetch tickets from the database & filter out resolved ones
  const loadTickets = useCallback(() => {
    if (!localStorage.getItem('token')) return Promise.resolve();

    return fetch(`${API_BASE}/tickets`, {
      method: 'GET',
      headers: authHeaders(),
    })
      .then((res) => res.json())
      .then((data) => {
        let ticketArray = [];
        if (data?.tickets && Array.isArray(data.tickets)) {
          ticketArray = data.tickets;
        } else if (Array.isArray(data)) {
          ticketArray = data;
        }

        // Filter out any tickets where resolved === true
        setIncidents(ticketArray.filter((ticket) => !ticket.resolved));
      })
      .catch((err) => {
        console.error('Error loading tickets:', err);
      });
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Let Escape close the delete confirmation
  useEffect(() => {
    if (!deleteTarget) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') setDeleteTarget(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteTarget]);

  function handleDepartmentChange(newDepartment) {
    setDepartment(newDepartment);
    setService(departmentServices[newDepartment][0]);
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setTitle('');
    setUnit('');
    setDescription('');
    setDepartment(departments[0]);
    setService(departmentServices[departments[0]][0]);
    setSeverity('');
  }

  function openCreateForm() {
    setEditingId(null);
    setTitle('');
    setUnit('');
    setDescription('');
    setDepartment(departments[0]);
    setService(departmentServices[departments[0]][0]);
    setSeverity('');
    setShowForm(true);
  }

  function openEditForm(incident) {
    setEditingId(incident._id);
    setTitle(incident.title || '');
    setUnit(incident.unit || '');
    setDescription(incident.description || '');
    const svc = incident.service || incident.type || '';
    setDepartment(departmentOf(svc));
    setService(svc || departmentServices[departments[0]][0]);
    setSeverity(incident.severity ? String(incident.severity) : '');
    setShowForm(true);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);

    try {
      const res = await fetch(`${API_BASE}/tickets/delete/${target._id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ resolved: true }),
      });

      if (!res.ok) {
        alert('Could not delete the ticket. Please try again.');
        return;
      }

      // Only remove the ticket from the list once the server confirms it
      setIncidents((current) => current.filter((incident) => incident._id !== target._id));
    } catch (err) {
      console.error(err);
      alert('Could not reach the server. The ticket was not deleted.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      alert('Please describe the issue.');
      return;
    }

    const payload = {
      title,
      unit,
      description: trimmedDescription,
      service,
      severity: Number(severity),
      type: service, // the ticket model still requires type
    };

    if (editingId) {
      // editing an existing incident
      try {
        const res = await fetch(`${API_BASE}/tickets/edit/${editingId}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(errorText(data, 'Could not save your changes. Please try again.'));
          return; // keep the form open so nothing typed is lost
        }

        setIncidents((current) =>
          current.map((incident) =>
            incident._id === editingId ? { ...incident, ...payload } : incident
          )
        );
      } catch (err) {
        console.error(err);
        alert('Could not reach the server. Your changes were not saved.');
        return;
      }
    } else {
      // creating a new incident
      try {
        const res = await fetch(`${API_BASE}/tickets/create`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          alert(errorText(data, 'Failed to create ticket'));
          return; // keep the form open so nothing typed is lost
        }

        // Reload so the new ticket comes back with its reporter filled in
        await loadTickets();
      } catch (err) {
        console.error(err);
        alert('Could not reach the server. Your ticket was not created.');
        return;
      }
    }

    resetForm();
  }

  // Tickets without a severity (created before Sprint 2) only show under "All".
  const visibleIncidents = incidents.filter((i) => (Number(i.severity) || 0) >= minSeverity);

  return (
    <div className="page page-wide">
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
              <label htmlFor="ticket-issue">Issue</label>
              <input
                id="ticket-issue"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="ticket-description">Description</label>
              <textarea
                id="ticket-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What is wrong, when did it start, and anything staff should know?"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="ticket-location">Location</label>
              <input
                id="ticket-location"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="ticket-department">Department / Team</label>
              <select
                id="ticket-department"
                value={department}
                onChange={(e) => handleDepartmentChange(e.target.value)}
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="ticket-service">Service</label>
              <select
                id="ticket-service"
                value={service}
                onChange={(e) => setService(e.target.value)}
              >
                {(departmentServices[department] || []).map((svc) => (
                  <option key={svc} value={svc}>{svc}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="ticket-severity">Severity</label>
              <select
                id="ticket-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                required
              >
                <option value="" disabled>Choose a severity</option>
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.value} - {s.label}</option>
                ))}
              </select>
              <ul className="severity-help">
                {SEVERITIES.map((s) => (
                  <li key={s.value}><strong>{s.value} {s.label}:</strong> {s.description}</li>
                ))}
              </ul>
            </div>
            <button type="submit" className="btn">
              {editingId ? 'Save Changes' : 'Submit Ticket'}
            </button>
          </form>
        </div>
      )}

      <div className="list-toolbar">
        <label htmlFor="severity-filter">Show</label>
        <select
          id="severity-filter"
          value={minSeverity}
          onChange={(e) => setMinSeverity(Number(e.target.value))}
        >
          <option value={0}>All severities</option>
          {SEVERITIES.slice(1).map((s) => (
            <option key={s.value} value={s.value}>
              {s.value === 4 ? `${s.label} only` : `${s.label} and above`}
            </option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Issue</th>
              <th>Service</th>
              <th>Severity</th>
              <th>Location</th>
              <th>Reported By</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleIncidents.map((incident) => {
              const statusLabel = incident.status || 'Open';
              const sev = severityOf(incident.severity);
              const reporter = getReporter(incident);
              // Older tickets stored a copy of the title as their description; don't show it twice
              const showDescription =
                incident.description && incident.description !== incident.title;
              return (
                <tr key={incident._id}>
                  <td>{incident._id ? incident._id.slice(-6).toUpperCase() : incident.id}</td>
                  <td>
                    <div>{incident.title}</div>
                    {showDescription && (
                      <div className="ticket-description" title={incident.description}>
                        {incident.description}
                      </div>
                    )}
                  </td>
                  <td>{incident.service || incident.type}</td>
                  <td>
                    {sev ? (
                      <span className={`severity severity-${sev.value}`} title={sev.description}>
                        {sev.value} · {sev.label}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{incident.unit}</td>
                  <td>
                    <div>{reporter.name}</div>
                    {reporter.email && <div className="muted">{reporter.email}</div>}
                  </td>
                  <td>
                    <span className={`status status-${statusLabel.toLowerCase()}`}>
                      {statusLabel}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-outline btn-small" onClick={() => openEditForm(incident)}>
                      Edit
                    </button>
                    <button className="btn btn-outline btn-small" onClick={() => setDeleteTarget(incident)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {visibleIncidents.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">No incidents to show.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-title">Delete this ticket?</h3>
            <p>
              “{deleteTarget.title}” will be removed from the active incidents
              list and can’t be undone.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-outline"
                onClick={() => setDeleteTarget(null)}
                autoFocus
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Incidents;
