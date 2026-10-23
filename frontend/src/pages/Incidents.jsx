import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { departmentServices } from '../data/services';
import { SEVERITIES, severityOf } from '../data/severity';
import { deleteTicket, editTicket, listTickets } from '../api/tickets';
import { useSession } from '../context/SessionContext';
import { formatStatus, isClosed, isFiledBy } from '../utils/incidents';
import TicketForm from '../components/TicketForm';

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

// The team (department) that handles a service, e.g. "pipe repairs" -> "Plumbing"
function teamOfService(service) {
  return Object.keys(departmentServices).find((d) => departmentServices[d].includes(service)) || null;
}

// Team queue: tickets the user filed plus every open ticket for their team.
// Residents never reach this page (see RoleRoute); they use their profile.
function Incidents() {
  const navigate = useNavigate();
  const { userId, logout, myTeams, isAdmin, leads } = useSession();
  const [incidents, setIncidents] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // ticket being edited
  const [minSeverity, setMinSeverity] = useState(0); // list filter, 0 = all
  const [view, setView] = useState('all'); // all | team | mine
  const [deleteTarget, setDeleteTarget] = useState(null); // ticket waiting on delete confirmation
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState(null); // { ok, text }

  const handleAuthError = useCallback((err) => {
    if (err?.status !== 401) return false;
    logout();
    navigate('/login', { replace: true });
    return true;
  }, [logout, navigate]);

  // Only open work belongs here; resolved and closed tickets live on the profile
  const loadTickets = useCallback(() => listTickets()
    .then((tickets) => {
      setIncidents(tickets.filter((t) => !isClosed(t)));
      setLoadError('');
    })
    .catch((err) => {
      if (!handleAuthError(err)) setLoadError(`Couldn't load tickets. ${err.message}`);
    }), [handleAuthError]);

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

  // The list only contains tickets I filed or tickets for my teams (home team and any team I
  // lead), so anything I didn't file is my team's. A ticket I filed is also my team's if one of
  // my teams handles its service. teamName says which team, for leads with several.
  const myTeamsKey = myTeams.join('|');
  const relationOf = useCallback((incident) => {
    const filed = isFiledBy(incident, userId);
    const teamName = teamOfService(incident.service || incident.type);
    const team = !filed || isAdmin || myTeamsKey.split('|').includes(teamName);
    return { filed, team, teamName };
  }, [userId, isAdmin, myTeamsKey]);

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await deleteTicket(target._id);
      setIncidents((current) => current.filter((i) => i._id !== target._id));
      setNotice({ ok: true, text: `“${target.title}” was deleted.` });
    } catch (err) {
      if (!handleAuthError(err)) setNotice({ ok: false, text: `Not deleted. ${err.message}` });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function saveEdit(payload) {
    try {
      await editTicket(editing._id, payload);
    } catch (err) {
      if (handleAuthError(err)) return;
      throw err; // the form shows it
    }
    setIncidents((current) => current.map((i) => (i._id === editing._id ? { ...i, ...payload } : i)));
    setNotice({ ok: true, text: 'Changes saved.' });
    setEditing(null);
  }

  // Tickets without a severity (created before Sprint 2) only show under "All".
  const visibleIncidents = useMemo(() => incidents.filter((i) => {
    if ((Number(i.severity) || 0) < minSeverity) return false;
    const rel = relationOf(i);
    if (view === 'team') return rel.team;
    if (view === 'mine') return rel.filed;
    return true;
  }), [incidents, minSeverity, view, relationOf]);

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {isAdmin ? 'All teams' : leads.length ? `Team lead · ${myTeams.join(', ')}` : myTeams.length ? `${myTeams[0]} team` : 'Staff'}
          </p>
          <h1>Team Queue</h1>
          <p className="lede">Open tickets for your team, plus any you filed yourself.</p>
        </div>
        <Link to="/tickets/new" className="btn">Create Ticket</Link>
      </div>

      {editing && (
        <div className="card">
          <h3 className="card-title">Edit ticket</h3>
          <TicketForm
            key={editing._id}
            initial={editing}
            onSubmit={saveEdit}
            onCancel={() => setEditing(null)}
            submitLabel="Save changes"
          />
        </div>
      )}

      {notice && (
        <p className={`flash ${notice.ok ? 'flash-ok' : 'flash-error'}`} role={notice.ok ? 'status' : 'alert'}>
          {notice.text}
        </p>
      )}
      {loadError && <p className="flash flash-error" role="alert">{loadError}</p>}

      <div className="list-toolbar">
        <div className="segmented" role="group" aria-label="Which tickets">
          {[
            ['all', 'All'],
            ['team', 'My team'],
            ['mine', 'Filed by me'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={view === value ? 'active' : ''}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label htmlFor="severity-filter">Severity</label>
        <select
          id="severity-filter"
          className="select-compact"
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
              const rel = relationOf(incident);
              const timeline = `/incidents/${incident._id}/timeline`;
              // Older tickets stored a copy of the title as their description; don't show it twice
              const showDescription = incident.description && incident.description !== incident.title;
              return (
                <tr key={incident._id}>
                  <td className="mono">{incident._id ? incident._id.slice(-6).toUpperCase() : incident.id}</td>
                  <td>
                    <div><Link to={timeline}>{incident.title}</Link></div>
                    {showDescription && (
                      <div className="ticket-description" title={incident.description}>
                        {incident.description}
                      </div>
                    )}
                    <div className="tag-row">
                      {rel.filed && <span className="tag">Filed by you</span>}
                      {rel.team && <span className="tag tag-team">{myTeams.length > 1 || isAdmin ? rel.teamName || 'Your team' : 'Your team'}</span>}
                      {rel.filed && !rel.team && <span className="tag tag-muted">Handled by another team</span>}
                    </div>
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
                    <span className={`status status-${statusLabel.toLowerCase()}`}>{formatStatus(statusLabel)}</span>
                    <div className="muted assignee">
                      {incident.assignedTo ? `→ ${incident.assignedTo.name || 'Assigned'}` : 'Unassigned'}
                    </div>
                  </td>
                  <td className="actions-cell">
                    {/* Only show what this user is allowed to do with this ticket */}
                    {rel.team && (
                      <Link to={timeline} className="btn btn-small">Update status</Link>
                    )}
                    {rel.filed && (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline btn-small"
                          onClick={() => {
                            setEditing(incident);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="btn btn-outline btn-small" onClick={() => setDeleteTarget(incident)}>
                          Delete
                        </button>
                      </>
                    )}
                    {!rel.team && !rel.filed && <Link to={timeline} className="text-link">View</Link>}
                  </td>
                </tr>
              );
            })}
            {visibleIncidents.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">No open incidents to show.</td>
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
              “{deleteTarget.title}” will be removed permanently and can’t be undone.
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)} autoFocus>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default Incidents;
