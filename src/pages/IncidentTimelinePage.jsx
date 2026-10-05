import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getIncident, getIncidentTimeline } from '../api/profile';
import { clearToken } from '../api/client';
import { formatDate, formatStatus, nameOf } from '../utils/incidents';
import './Profile.css';

// Turns one timeline event into a readable sentence. Read-only by design:
// events are written by the backend whenever the incident changes.
function describe(event) {
  const actor = nameOf(event.actor) || 'System';
  switch (event.type) {
    case 'created':
      return `${actor} filed this incident`;
    case 'status_change':
      return `${actor} changed status from ${formatStatus(event.from)} to ${formatStatus(event.to)}`;
    case 'assignment_change': {
      const from = nameOf(event.from);
      const to = nameOf(event.to);
      if (!from && to) return `${actor} assigned this to ${to}`;
      if (from && !to) return `${actor} unassigned ${from}`;
      return `${actor} reassigned this from ${from} to ${to}`;
    }
    case 'comment':
      return `${actor} commented`;
    default:
      return `${actor} updated this incident`;
  }
}

export default function IncidentTimelinePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [incident, setIncident] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getIncident(id), getIncidentTimeline(id)])
      .then(([inc, timeline]) => {
        if (cancelled) return;
        setIncident(inc);
        const list = Array.isArray(timeline) ? [...timeline] : [];
        // Oldest first so the timeline reads top to bottom.
        list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        setEvents(list);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) {
          clearToken();
          navigate('/login', { replace: true });
          return;
        }
        setError(err.status === 403 ? "You don't have access to this incident." : err.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  if (loading) return <main className="pf-page"><p>Loading timeline…</p></main>;

  return (
    <main className="pf-page">
      <Link to="/profile" className="pf-back">Back to profile</Link>

      {error ? (
        <p className="pf-error">{error}</p>
      ) : (
        <>
          <header className="pf-timeline-header">
            <h1 className="pf-name">{incident.title || 'Untitled incident'}</h1>
            <p className="pf-incident-meta">
              <span className={`pf-status pf-status-${String(incident.status).toLowerCase()}`}>
                {formatStatus(incident.status)}
              </span>
              {incident.severity && <span>Severity: {formatStatus(incident.severity)}</span>}
              {incident.assignedTo && <span>Assigned to: {nameOf(incident.assignedTo)}</span>}
            </p>
          </header>

          <h2>Timeline</h2>
          {events.length === 0 ? (
            <p className="pf-empty">No activity recorded for this incident yet.</p>
          ) : (
            <ol className="pf-timeline">
              {events.map((e) => (
                <li key={e._id} className={`pf-event pf-event-${e.type}`}>
                  <p className="pf-event-text">{describe(e)}</p>
                  {e.type === 'comment' && e.comment && (
                    <blockquote className="pf-event-comment">{e.comment}</blockquote>
                  )}
                  <time className="pf-event-time" dateTime={e.createdAt}>
                    {formatDate(e.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}
