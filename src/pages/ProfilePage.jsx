import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMe, getMyIncidents, updateBio } from '../api/profile';
import { clearToken } from '../api/client';
import { splitIncidents, formatDate, formatStatus } from '../utils/incidents';
import './Profile.css';

const BIO_MAX = 500;

function IncidentColumn({ title, incidents, emptyText }) {
  return (
    <section className="pf-column" aria-labelledby={`col-${title}`}>
      <h2 id={`col-${title}`} className="pf-column-title">
        {title} <span className="pf-count">({incidents.length})</span>
      </h2>
      {incidents.length === 0 ? (
        <p className="pf-empty">{emptyText}</p>
      ) : (
        <ul className="pf-incident-list">
          {incidents.map((i) => (
            <li key={i._id}>
              <Link to={`/incidents/${i._id}/timeline`} className="pf-incident">
                <span className="pf-incident-title">{i.title || 'Untitled incident'}</span>
                <span className="pf-incident-meta">
                  <span className={`pf-status pf-status-${String(i.status).toLowerCase()}`}>
                    {formatStatus(i.status)}
                  </span>
                  {i.severity && <span>Severity: {formatStatus(i.severity)}</span>}
                  <span>{formatDate(i.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
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
      clearToken();
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
    () => (user ? splitIncidents(incidents, user._id) : { active: [], closed: [], filed: [] }),
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
      setUser((u) => ({ ...u, bio: updated?.bio ?? bioDraft.trim() }));
      setEditing(false);
    } catch (err) {
      if (!handleAuthError(err)) setBioError(`Bio not saved: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="pf-page"><p>Loading profile…</p></main>;
  if (error) return <main className="pf-page"><p className="pf-error">Couldn't load your profile: {error}</p></main>;

  return (
    <main className="pf-page">
      <header className="pf-header">
        <img src="/default-avatar.svg" alt="Profile picture" className="pf-avatar" />
        <div className="pf-identity">
          <h1 className="pf-name">{user.username}</h1>
          <p className="pf-detail">{user.email}</p>
          <p className="pf-detail">User ID: <code>{user._id}</code></p>
        </div>
      </header>

      <section className="pf-bio" aria-labelledby="bio-heading">
        <div className="pf-bio-head">
          <h2 id="bio-heading">Bio</h2>
          {!editing && (
            <button type="button" className="pf-btn" onClick={startEdit}>
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
              <button type="button" className="pf-btn" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="pf-btn pf-btn-primary" onClick={saveBio} disabled={saving}>
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
          title="Active"
          incidents={columns.active}
          emptyText="No open incidents filed by or assigned to you."
        />
        <IncidentColumn
          title="Closed / resolved"
          incidents={columns.closed}
          emptyText="No closed or resolved incidents yet."
        />
        <IncidentColumn
          title="Filed by me"
          incidents={columns.filed}
          emptyText="You haven't filed any incidents."
        />
      </div>
    </main>
  );
}
