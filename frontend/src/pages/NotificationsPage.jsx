import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { announceChange, listNotifications, markAllRead, markRead } from '../api/notifications';
import { useSession } from '../context/SessionContext';
import { severityOf } from '../data/severity';
import { serviceLabel } from '../data/services';
import { formatDate } from '../utils/incidents';

const TYPE_LABELS = {
  assigned: 'Assigned to you',
  final: 'Final escalation',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
};

const EMAIL_LABELS = {
  sent: 'Also emailed',
  failed: 'Email failed',
  skipped: 'Email not configured',
  pending: 'Email sending…',
};

// Everything the app told this person: tickets assigned to them (by being on call, by their
// team lead, or by escalation), final escalations for teams they lead, and, for reporters,
// when their ticket was acknowledged and resolved. Each one was also sent by email.
export default function NotificationsPage() {
  const navigate = useNavigate();
  const { logout } = useSession();
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(() => listNotifications(100)
    .then((d) => {
      setItems(d.notifications);
      setUnread(d.unread);
      setError('');
    })
    .catch((err) => {
      if (err.status === 401) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      setError(`Couldn't load notifications. ${err.message}`);
    }), [logout, navigate]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30 * 1000);
    return () => clearInterval(t);
  }, [load]);

  async function open(n) {
    if (!n.read) {
      try {
        const res = await markRead(n._id);
        setUnread(res.unread);
        setItems((list) => list.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
        announceChange();
      } catch {
        /* still open the ticket */
      }
    }
    if (n.ticket) navigate(`/incidents/${n.ticket}/timeline`);
  }

  async function readAll() {
    try {
      await markAllRead();
      setUnread(0);
      setItems((list) => list.map((x) => ({ ...x, read: true })));
      announceChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Inbox</p>
          <h1>Notifications</h1>
          <p className="lede">
            {unread ? `${unread} unread.` : 'You’re all caught up.'} Each notification was also sent to your email.
          </p>
        </div>
        {unread > 0 && (
          <button type="button" className="btn btn-outline" onClick={readAll}>Mark all as read</button>
        )}
      </div>

      {error && <p className="flash flash-error" role="alert">{error}</p>}
      {!items && !error && <p className="muted">Loading…</p>}
      {items && items.length === 0 && <p className="muted">No notifications yet.</p>}

      {items && items.length > 0 && (
        <ul className="notif-list">
          {items.map((n) => {
            const sev = severityOf(n.severity);
            return (
              <li key={n._id} className={`notif notif-${n.type} ${n.read ? 'notif-read' : 'notif-unread'}`}>
                <button type="button" className="notif-body" onClick={() => open(n)}>
                  <span className="notif-head">
                    <span className={`tag notif-type notif-type-${n.type}`}>{TYPE_LABELS[n.type] || n.type}</span>
                    {!n.read && <span className="notif-dot" aria-label="Unread" />}
                    <span className="muted notif-time">{formatDate(n.createdAt)}</span>
                  </span>
                  <span className="notif-title">{n.title}</span>
                  <span className="notif-message">{n.message}</span>
                  {(n.ticketRef || n.service || sev) && (
                    <span className="notif-facts">
                      {n.ticketRef && <span><b>Incident</b> <span className="mono">{n.ticketRef}</span></span>}
                      {n.service && <span><b>Service</b> {serviceLabel(n.service)}</span>}
                      {sev && <span><b>Severity</b> <span className={`severity severity-${sev.value}`}>{sev.value} · {sev.label}</span></span>}
                    </span>
                  )}
                  {n.action && <span className="notif-action"><b>Action needed:</b> {n.action}</span>}
                  {n.email && <span className={`muted notif-email notif-email-${n.email}`}>{EMAIL_LABELS[n.email] || n.email}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="muted">
        <Link to="/profile" className="text-link">Back to your profile</Link>
      </p>
    </main>
  );
}
