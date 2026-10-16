import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMe, getMyIncidents, updateBio } from '../api/profile';
import { photoUrl, useSession } from '../context/SessionContext';
import {
  finishedAt, formatDate, formatStatus, isAssignedTo, isFiledBy, splitIncidents,
} from '../utils/incidents';
import { severityOf } from '../data/severity';
import './Profile.css';

const BIO_MAX = 500;

// dateLabel / dateOf decide what date each card shows. The Closed column shows
// the date it was finished, which is also what it's sorted by.
function IncidentColumn({ id, title, incidents, emptyText, userId, dateLabel, dateOf, action }) {
  return (
    <section className="pf-column" aria-labelledby={id}>
      <div className="pf-column-head">
        <h2 id={id} className="pf-column-title">
          {title} <span className="pf-count">{incidents.length}</span>
        </h2>
        {action}
      </div>
      {incidents.length === 0 ? (
        <p className="pf-empty">{emptyText}</p>
      ) : (
        <ul className="pf-incident-list">
          {incidents.map((i) => {
            const sev = severityOf(i.severity);
            const filed = isFiledBy(i, userId);
            const assigned = isAssignedTo(i, userId);
            return (
              <li key={i._id}>
                <Link to={`/incidents/${i._id}/timeline`} className="pf-incident">
                  <span className="pf-incident-top">
                    <span className="pf-incident-title">{i.title || 'Untitled incident'}</span>
                    <span className={`status status-${String(i.status).toLowerCase()}`}>
                      {formatStatus(i.status)}
                    </span>
                  </span>
                  <span className="pf-incident-meta">
                    {sev && <span className={`severity severity-${sev.value}`}>{sev.label}</span>}
                    <span>{i.service}</span>
                    <span>{dateLabel} {formatDate(dateOf(i))}</span>
                  </span>
                  <span className="tag-row">
                    {filed && <span className="tag">Filed by you</span>}
                    {assigned && <span className="tag tag-team">Assigned to you</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { logout, setUser: setSessionUser, canSeeQueue } = useSession();
  const [user, setUser] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [bioError, setBioError] = useState('');

  const handleAuthError = (err) => {
    if (err.status === 401) {
      logout();
      navigate('/login', { replace: true });
      return true;
    }
    return false;
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMe(), getMyIncidents()])
      .then(([me, list]) => {
        if (cancelled) return;
        setUser(me);
        setIncidents(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (cancelled || handleAuthError(err)) return;
        setError(err.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo(
    () => (user ? splitIncidents(incidents, user._id) : { active: [], closed: [] }),
    [incidents, user]
  );

  const startEdit = () => {
    setBioDraft(user.bio || '');
    setBioError('');
    setEditing(true);
  };

  const saveBio = async () => {
    setSaving(true);
    setBioError('');
    try {
      const updated = await updateBio(bioDraft.trim());
      // Accept either the updated user object or { bio } back from the API.
      const bio = updated?.bio ?? bioDraft.trim();
      setUser((u) => ({ ...u, bio }));
      setSessionUser((u) => (u ? { ...u, bio } : u));
      setEditing(false);
    } catch (err) {
      if (!handleAuthError(err)) setBioError(`Bio not saved: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="pf-page"><p className="muted">Loading profile…</p></main>;
  if (error) return <main className="pf-page"><p className="pf-error">Couldn't load your profile: {error}</p></main>;

  return (
    <main className="pf-page">
      <header className="pf-header">
        <img
          src={photoUrl(user.photo)}
          alt={`${user.name}'s profile picture`}
          className="pf-avatar"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = '/default-avatar.svg';
          }}
        />
        <div className="pf-identity">
          <p className="eyebrow">{user.teamName ? `${user.teamName} team` : 'Resident'}</p>
          <h1 className="pf-name">{user.name}</h1>
          <p className="pf-detail">{user.email}</p>
        </div>
        <div className="pf-header-actions">
          <Link to="/tickets/new" className="btn">Report an Issue</Link>
          {canSeeQueue && <Link to="/incidents" className="btn btn-outline">Team Queue</Link>}
        </div>
      </header>

      <section className="pf-bio" aria-labelledby="bio-heading">
        <div className="pf-bio-head">
          <h2 id="bio-heading">Bio</h2>
          {!editing && (
            <button type="button" className="btn btn-outline btn-small" onClick={startEdit}>
              Edit bio
            </button>
          )}
        </div>

        {editing ? (
          <>
            <textarea
              className="pf-bio-input"
              value={bioDraft}
              maxLength={BIO_MAX}
              rows={4}
              onChange={(e) => setBioDraft(e.target.value)}
              aria-label="Bio"
              autoFocus
            />
            <div className="pf-bio-actions">
              <span className="pf-char-count">{bioDraft.length}/{BIO_MAX}</span>
              <button type="button" className="btn btn-outline btn-small" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn btn-small" onClick={saveBio} disabled={saving}>
                {saving ? 'Saving…' : 'Save bio'}
              </button>
            </div>
            {bioError && <p className="pf-error">{bioError}</p>}
          </>
        ) : (
          <p className="pf-bio-text">{user.bio || 'No bio yet. Add a few lines about yourself.'}</p>
        )}
      </section>

      <div className="pf-columns">
        <IncidentColumn
          id="col-active"
          title="Active incidents"
          incidents={columns.active}
          userId={user._id}
          dateLabel="Filed"
          dateOf={(i) => i.createdAt}
          emptyText="Nothing open right now. Anything you report will show up here."
        />
        <IncidentColumn
          id="col-closed"
          title="Resolved & closed"
          incidents={columns.closed}
          userId={user._id}
          dateLabel="Finished"
          dateOf={finishedAt}
          emptyText="No resolved or closed incidents yet."
        />
      </div>
    </main>
  );
}
