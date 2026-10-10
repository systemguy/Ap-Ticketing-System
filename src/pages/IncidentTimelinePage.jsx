import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addComment, changeStatus, getTicket } from '../api/tickets';
import { clearToken } from '../api/client';
import { severityOf } from '../data/severity';
import { formatDate, formatStatus, nameOf } from '../utils/incidents';
import './Profile.css';

const COMMENT_MAX = 1000;

// Button text for each status a solver can move the ticket to
const ACTION_LABELS = {
  Acknowledged: 'Acknowledge',
  Investigating: 'Start investigating',
  Resolved: 'Mark resolved',
  Closed: 'Close',
  Open: 'Reopen',
};

// Turns one timeline event into a readable sentence. Read-only by design:
// events are written by the backend whenever the incident changes.
function describe(event) {
  const actor = nameOf(event.actor) || 'System';
  switch (event.type) {
    case 'created':
      return `${actor} filed this incident`;
    case 'status_change':
      if (event.to === 'Open') return `${actor} reopened this incident (it was ${formatStatus(event.from)})`;
      return `${actor} changed status from ${formatStatus(event.from)} to ${formatStatus(event.to)}`;
    case 'assignment_change': {
      const from = nameOf(event.from);
      const to = nameOf(event.to);
      if (!from && to) return to === actor ? `${actor} assigned this to themselves` : `${actor} assigned this to ${to}`;
      if (from && !to) return `${actor} unassigned ${from}`;
      return `${actor} reassigned this from ${from} to ${to}`;
    }
    case 'edited':
      return `${actor} edited the ${event.fields?.length ? event.fields.join(', ') : 'details'}`;
    case 'comment':
      return `${actor} commented`;
    case 'note':
      return `${actor} added a staff note`;
    default:
      return `${actor} updated this incident`;
  }
}

export default function IncidentTimelinePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null); // { ticket, role, nextStatuses } from GET /tickets/:id
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null); // { ok, text } after a status change or comment
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');

  // An expired login comes back as 401: clear it and go to the login page
  const handleAuthError = useCallback((err) => {
    if (err.status !== 401) return false;
    clearToken();
    navigate('/login', { replace: true });
    return true;
  }, [navigate]);

  const load = useCallback(() => getTicket(id)
    .then((res) => {
      setData(res);
      setError('');
    })
    .catch((err) => {
      if (handleAuthError(err)) return;
      setError(err.status === 403 ? "You don't have access to this incident." : err.message);
    }), [id, handleAuthError]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function moveTo(status) {
    setBusy(true);
    setFlash(null);
    try {
      const res = await changeStatus(id, status);
      setFlash({ ok: true, text: `${res.message}.` });
    } catch (err) {
      if (handleAuthError(err)) return;
      setFlash({ ok: false, text: `Status not changed. ${err.message}` });
    }
    await load(); // show the ticket's current status either way
    setBusy(false);
  }

  async function postComment(e) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const res = await addComment(id, comment);
      setComment('');
      setFlash({ ok: true, text: res.type === 'note' ? 'Note added to the timeline.' : 'Comment added to the timeline.' });
    } catch (err) {
      if (handleAuthError(err)) return;
      setFlash({ ok: false, text: `Not posted. ${err.message}` });
    }
    await load();
    setBusy(false);
  }

  if (loading) return <main className="pf-page"><p>Loading timeline…</p></main>;
  if (error) {
    return (
      <main className="pf-page">
        <Link to="/profile" className="pf-back">Back to profile</Link>
        <p className="pf-error">{error}</p>
      </main>
    );
  }

  const { ticket, role, nextStatuses } = data;
  const isSolver = role === 'solver';
  const sev = severityOf(ticket.severity);
  // Oldest first so the timeline reads top to bottom
  const events = [...(ticket.events || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return (
    <main className="pf-page">
      <Link to="/profile" className="pf-back">Back to profile</Link>

      <header className="pf-timeline-header">
        <h1 className="pf-name">{ticket.title || 'Untitled incident'}</h1>
        <p className="pf-incident-meta">
          <span className={`pf-status pf-status-${String(ticket.status).toLowerCase()}`}>
            {formatStatus(ticket.status)}
          </span>
          {sev && <span>Severity: {sev.label}</span>}
          <span>Service: {ticket.service}</span>
          <span>Location: {ticket.unit}</span>
          <span>Reported by: {nameOf(ticket.userPosted)}</span>
          {ticket.assignedTo && <span>Assigned to: {nameOf(ticket.assignedTo)}</span>}
        </p>
        {ticket.description && <p className="pf-description">{ticket.description}</p>}
      </header>

      {flash && (
        <p className={`pf-flash ${flash.ok ? 'pf-flash-ok' : 'pf-flash-error'}`} role={flash.ok ? 'status' : 'alert'}>
          {flash.text}
        </p>
      )}

      {/* Only the ticket's team gets buttons, and only for the legal next statuses */}
      {nextStatuses.length > 0 && (
        <div className="pf-status-actions">
          {nextStatuses.map((s) => (
            <button key={s} type="button" className="pf-btn pf-btn-primary" disabled={busy} onClick={() => moveTo(s)}>
              {ACTION_LABELS[s] || `Move to ${s}`}
            </button>
          ))}
        </div>
      )}

      <h2>Timeline</h2>
      {events.length === 0 ? (
        <p className="pf-empty">No activity recorded for this incident yet.</p>
      ) : (
        <ol className="pf-timeline">
          {events.map((e) => (
            <li key={e._id} className={`pf-event pf-event-${e.type}`}>
              <p className="pf-event-text">{describe(e)}</p>
              {(e.type === 'comment' || e.type === 'note') && e.comment && (
                <blockquote className="pf-event-comment">{e.comment}</blockquote>
              )}
              <time className="pf-event-time" dateTime={e.createdAt}>
                {formatDate(e.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}

      <form className="pf-comment-form" onSubmit={postComment}>
        <label htmlFor="ticket-comment" className="pf-comment-label">
          {isSolver ? 'Add a note for the reporter' : 'Add a comment for the team'}
        </label>
        <textarea
          id="ticket-comment"
          className="pf-bio-input"
          rows={3}
          maxLength={COMMENT_MAX}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="pf-bio-actions">
          <span className="pf-char-count">Visible to the reporter and the team. It can't be edited after posting.</span>
          <button type="submit" className="pf-btn pf-btn-primary" disabled={busy || !comment.trim()}>
            {isSolver ? 'Add note' : 'Add comment'}
          </button>
        </div>
      </form>
    </main>
  );
}
