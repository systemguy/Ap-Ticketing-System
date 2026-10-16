import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { addComment, changeStatus, getTicket } from '../api/tickets';
import { useSession } from '../context/SessionContext';
import { severityOf } from '../data/severity';
import { formatDate, formatStatus, nameOf } from '../utils/incidents';
import './Profile.css';

const COMMENT_MAX = 1000;
const REASON_MIN = 10;

// Button text for each status a solver can move the ticket to
const ACTION_LABELS = {
  Acknowledged: 'Acknowledge',
  Investigating: 'Start investigating',
  Resolved: 'Mark resolved',
  Closed: 'Close ticket',
  Open: 'Reopen',
};

// Moves that are hard to undo ask first. Reopening also needs a reason, which
// goes on the timeline as a staff note so everyone can see why it came back.
const CONFIRM = {
  Resolved: {
    title: 'Mark this ticket resolved?',
    body: 'The reporter will see it as resolved and it moves to the closed list. You can still reopen it later.',
    confirm: 'Mark resolved',
  },
  Closed: {
    title: 'Close this ticket?',
    body: 'Closing ends work on this ticket. To change it after this, someone will have to reopen it with a reason.',
    confirm: 'Close ticket',
  },
  Open: {
    title: 'Reopen this ticket?',
    body: 'This moves the ticket back to Open and restarts its lifecycle. Your reason is added to the timeline as a staff note.',
    confirm: 'Reopen ticket',
    needsReason: true,
  },
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

function ConfirmStatusDialog({ status, busy, onCancel, onConfirm }) {
  const copy = CONFIRM[status];
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  const reasonOk = !copy.needsReason || reason.trim().length >= REASON_MIN;
  const ready = acknowledged && reasonOk && !busy;

  return (
    <div className="modal-overlay" onClick={() => !busy && onCancel()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-status-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-status-title">{copy.title}</h3>
        <p>{copy.body}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) onConfirm(reason.trim());
          }}
        >
          {copy.needsReason && (
            <div className="form-group">
              <label htmlFor="reopen-reason">Reason for reopening</label>
              <textarea
                id="reopen-reason"
                rows={3}
                maxLength={COMMENT_MAX}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Resident reports the leak came back overnight"
                autoFocus
              />
              <p className="field-hint">At least {REASON_MIN} characters.</p>
            </div>
          )}

          <label className="checkbox">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              autoFocus={!copy.needsReason}
            />
            <span>I understand this changes the ticket's status for everyone.</span>
          </label>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={`btn ${status === 'Open' ? 'btn-danger' : ''}`} disabled={!ready}>
              {busy ? 'Saving…' : copy.confirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function IncidentTimelinePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, canSeeQueue } = useSession();
  const [data, setData] = useState(null); // { ticket, role, nextStatuses } from GET /tickets/:id
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // { ok, text } after a status change or comment; a new ticket arrives with one in router state
  const [flash, setFlash] = useState(location.state?.flash ? { ok: true, text: location.state.flash } : null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(null); // status waiting on confirmation

  const back = canSeeQueue ? { to: '/incidents', label: 'Back to team queue' } : { to: '/profile', label: 'Back to my incidents' };

  // An expired login comes back as 401: clear it and go to the login page
  const handleAuthError = useCallback((err) => {
    if (err.status !== 401) return false;
    logout();
    navigate('/login', { replace: true });
    return true;
  }, [logout, navigate]);

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

  async function moveTo(status, reason = '') {
    setBusy(true);
    setFlash(null);
    try {
      const res = await changeStatus(id, status);
      let text = res?.message ? `${res.message}.` : `Status changed to ${formatStatus(status)}.`;
      if (reason) {
        try {
          await addComment(id, `Reason for reopening: ${reason}`);
        } catch {
          text += ' The reason could not be saved, so please add it as a note.';
        }
      }
      setFlash({ ok: true, text });
    } catch (err) {
      if (handleAuthError(err)) return;
      setFlash({ ok: false, text: `Status not changed. ${err.message}` });
    }
    setPending(null);
    await load(); // show the ticket's current status either way
    setBusy(false);
  }

  function requestMove(status) {
    if (CONFIRM[status]) setPending(status);
    else moveTo(status);
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

  if (loading) return <main className="pf-page"><p className="muted">Loading timeline…</p></main>;
  if (error) {
    return (
      <main className="pf-page">
        <Link to={back.to} className="pf-back">← {back.label}</Link>
        <p className="pf-error">{error}</p>
      </main>
    );
  }

  const { ticket, role, nextStatuses = [] } = data;
  const isSolver = role === 'solver';
  const sev = severityOf(ticket.severity);
  // Oldest first so the timeline reads top to bottom
  const events = [...(ticket.events || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const forward = nextStatuses.filter((s) => s !== 'Open');
  const canReopen = nextStatuses.includes('Open');

  return (
    <main className="pf-page">
      <Link to={back.to} className="pf-back">← {back.label}</Link>

      <header className="pf-timeline-header">
        <p className="eyebrow">Ticket {String(ticket._id).slice(-6).toUpperCase()}</p>
        <div className="pf-title-row">
          <h1 className="pf-name">{ticket.title || 'Untitled incident'}</h1>
          <span className={`status status-${String(ticket.status).toLowerCase()}`}>
            {formatStatus(ticket.status)}
          </span>
        </div>
        <dl className="pf-facts">
          {sev && (
            <div><dt>Severity</dt><dd><span className={`severity severity-${sev.value}`}>{sev.label}</span></dd></div>
          )}
          <div><dt>Service</dt><dd>{ticket.service}</dd></div>
          <div><dt>Location</dt><dd>{ticket.unit}</dd></div>
          <div><dt>Reported by</dt><dd>{nameOf(ticket.userPosted)}</dd></div>
          <div><dt>Assigned to</dt><dd>{ticket.assignedTo ? nameOf(ticket.assignedTo) : 'Not yet assigned'}</dd></div>
        </dl>
        {ticket.description && <p className="pf-description">{ticket.description}</p>}
        {ticket.photo && (
          <figure className="pf-photo">
            <a href={ticket.photo} target="_blank" rel="noreferrer">
              <img src={ticket.photo} alt={`Photo attached to “${ticket.title}”`} />
            </a>
            <figcaption>Photo from the reporter</figcaption>
          </figure>
        )}
      </header>

      {flash && (
        <p className={`flash ${flash.ok ? 'flash-ok' : 'flash-error'}`} role={flash.ok ? 'status' : 'alert'}>
          {flash.text}
        </p>
      )}

      {/* Only the ticket's team gets buttons, and only for the legal next statuses */}
      {isSolver && nextStatuses.length > 0 && (
        <div className="pf-status-actions">
          {forward.map((s) => (
            <button key={s} type="button" className="btn btn-small" disabled={busy} onClick={() => requestMove(s)}>
              {ACTION_LABELS[s] || `Move to ${s}`}
            </button>
          ))}
          {canReopen && (
            <button type="button" className="btn btn-outline btn-small" disabled={busy} onClick={() => requestMove('Open')}>
              {ACTION_LABELS.Open}…
            </button>
          )}
        </div>
      )}

      {/* Staff who filed a ticket for another department see why there are no status buttons */}
      {!isSolver && canSeeQueue && (
        <p className="pf-info">
          You filed this ticket, so you can comment on it. Its status is updated by the team that handles {ticket.service}.
        </p>
      )}

      <h2 className="pf-section-title">Timeline</h2>
      {events.length === 0 ? (
        <p className="pf-empty">No activity recorded for this incident yet.</p>
      ) : (
        <ol className="pf-timeline">
          {events.map((e) => (
            <li key={e._id || `${e.type}-${e.createdAt}`} className={`pf-event pf-event-${e.type}`}>
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
          <button type="submit" className="btn btn-small" disabled={busy || !comment.trim()}>
            {isSolver ? 'Add note' : 'Add comment'}
          </button>
        </div>
      </form>

      {pending && (
        <ConfirmStatusDialog
          status={pending}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => moveTo(pending, reason)}
        />
      )}
    </main>
  );
}
