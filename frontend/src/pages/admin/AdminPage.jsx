import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getOverview, listAccounts, setAccountActive, setTeamLead } from '../../api/admin';
import { useSession } from '../../context/SessionContext';
import Modal, { ErrorList } from '../../components/Modal';
import { formatTime } from '../../data/shifts';
import { serviceLabel } from '../../data/services';
import './Admin.css';

const NO_ONE = {
  'no-schedule': 'No schedule yet',
  'schedule-ended': 'Schedule ended',
  'not-covered': 'Gap right now',
  'responder-inactive': 'On-call account deactivated',
};

const typeOf = (u) => (u.role === 'admin' ? 'Admin' : u.team ? 'Responder' : 'Reporter');

// Admin portal: every team at a glance, who leads it and who is on call, plus accounts.
// Admins choose team leads and deactivate accounts (soft delete) here.
export default function AdminPage() {
  const navigate = useNavigate();
  const { logout, userId } = useSession();
  const [overview, setOverview] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [leadDrafts, setLeadDrafts] = useState({}); // teamId -> chosen lead id
  const [savingLead, setSavingLead] = useState(null);
  const [confirm, setConfirm] = useState(null); // account to (de)activate
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  const handleAuth = useCallback((err) => {
    if (err?.status !== 401) return false;
    logout();
    navigate('/login', { replace: true });
    return true;
  }, [logout, navigate]);

  const load = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([getOverview(), listAccounts()]);
      setOverview(o);
      setAccounts(a);
      setError(null);
    } catch (err) {
      if (!handleAuth(err)) setError(err);
    }
  }, [handleAuth]);

  useEffect(() => {
    load();
  }, [load]);

  // Anyone active with a home team can lead a team
  const leadOptions = useMemo(() => accounts.filter((a) => a.team && a.active), [accounts]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (filter === 'staff' && !(a.team && a.active)) return false;
      if (filter === 'reporters' && (a.team || a.role === 'admin' || !a.active)) return false;
      if (filter === 'deactivated' && a.active) return false;
      return !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
    });
  }, [accounts, filter, query]);

  async function saveLead(team) {
    const leadId = leadDrafts[team._id];
    setSavingLead(team._id);
    setFlash(null);
    try {
      const res = await setTeamLead(team._id, leadId);
      setFlash({ ok: true, text: `${res.team.lead.name} now leads ${team.name}.` });
      setLeadDrafts((d) => ({ ...d, [team._id]: undefined }));
      await load();
    } catch (err) {
      if (!handleAuth(err)) setFlash({ ok: false, text: `Lead not changed. ${err.message}` });
    } finally {
      setSavingLead(null);
    }
  }

  async function toggleActive() {
    setBusy(true);
    setConfirmError(null);
    try {
      await setAccountActive(confirm._id, !confirm.active);
      setFlash({ ok: true, text: `${confirm.name}’s account is ${confirm.active ? 'deactivated' : 'active again'}.` });
      setConfirm(null);
      await load();
    } catch (err) {
      if (!handleAuth(err)) setConfirmError(err);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="page page-wide">
        <h1>Admin portal</h1>
        <ErrorList error={error} />
      </main>
    );
  }
  if (!overview) return <main className="page page-wide"><p className="muted">Loading the admin portal…</p></main>;

  const { counts, teams, unownedServices } = overview;

  return (
    <main className="page page-wide admin">
      <p className="eyebrow">Administration</p>
      <h1>Admin portal</h1>
      <p className="lede">Teams, their leads and who is on call right now, plus every account in the system.</p>

      <div className="stat-row">
        <div className="stat"><span className="stat-value">{counts.activeTickets}</span><span className="stat-label">Active tickets</span></div>
        <div className={`stat ${counts.unassignedTickets ? 'stat-warn' : ''}`}><span className="stat-value">{counts.unassignedTickets}</span><span className="stat-label">Unassigned</span></div>
        <div className={`stat ${counts.teamsWithoutOnCall ? 'stat-warn' : ''}`}><span className="stat-value">{counts.teamsWithoutOnCall}</span><span className="stat-label">Teams with no one on call</span></div>
        <div className="stat"><span className="stat-value">{counts.staff}</span><span className="stat-label">Active responders</span></div>
      </div>

      {flash && <p className={`flash ${flash.ok ? 'flash-ok' : 'flash-error'}`} role="status">{flash.text}</p>}

      <section className="admin-section" aria-labelledby="teams-heading">
        <div className="section-head">
          <h2 id="teams-heading">Teams</h2>
          <Link to="/schedule" className="text-link">Open the schedule →</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Team</th><th>Team lead</th><th>On call now</th><th>Scheduled until</th><th>Services</th></tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const draft = leadDrafts[t._id];
                const current = t.lead?._id ? String(t.lead._id) : '';
                const value = draft ?? current;
                return (
                  <tr key={t._id}>
                    <td>
                      <Link to={`/schedule/${encodeURIComponent(t.name)}`} className="team-name">{t.name}</Link>
                      <div className="muted">{t.staff} responder{t.staff === 1 ? '' : 's'}</div>
                    </td>
                    <td>
                      <div className="lead-picker">
                        <select
                          className="select-compact"
                          value={value}
                          onChange={(e) => setLeadDrafts((d) => ({ ...d, [t._id]: e.target.value }))}
                          aria-label={`${t.name} team lead`}
                        >
                          {!current && <option value="">No lead</option>}
                          {leadOptions.map((p) => (
                            <option key={p._id} value={p._id}>{p.name} ({p.team})</option>
                          ))}
                        </select>
                        {draft && draft !== current && (
                          <button type="button" className="btn btn-small" onClick={() => saveLead(t)} disabled={savingLead === t._id}>
                            {savingLead === t._id ? 'Saving…' : 'Save'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      {t.onCall ? (
                        <>
                          <span className="pill pill-ok">{t.onCall.name}</span>
                          <div className="muted">until {formatTime(t.onCall.until, true)}</div>
                        </>
                      ) : (
                        <span className="pill pill-warn">{NO_ONE[t.onCallReason] || 'No one'}</span>
                      )}
                    </td>
                    <td>{t.scheduledUntil ? formatTime(t.scheduledUntil, 'date') : <span className="pill pill-warn">Nothing scheduled</span>}</td>
                    <td className="services-cell">{t.services.map(serviceLabel).join(', ') || <span className="muted">None</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {unownedServices.length > 0 && (
          <p className="admin-note">
            <b>Services with no owning team:</b> {unownedServices.map(serviceLabel).join(', ')}. Tickets for these can’t be assigned to anyone.
          </p>
        )}
      </section>

      <section className="admin-section" aria-labelledby="people-heading">
        <div className="section-head">
          <h2 id="people-heading">Accounts</h2>
          <div className="people-tools">
            <input
              type="search"
              className="search-input"
              placeholder="Search name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search accounts"
            />
            <div className="segmented" role="group" aria-label="Filter accounts">
              {[['all', 'All'], ['staff', 'Responders'], ['reporters', 'Reporters'], ['deactivated', `Deactivated (${counts.deactivated})`]].map(([v, label]) => (
                <button key={v} type="button" className={filter === v ? 'active' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Team</th><th>Leads</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a._id} className={a.active ? '' : 'row-inactive'}>
                  <td><div className="person-name">{a.name}</div><div className="muted">{a.email}</div></td>
                  <td>{typeOf(a)}</td>
                  <td>{a.team || <span className="muted">—</span>}</td>
                  <td>{a.leads.length ? a.leads.join(', ') : <span className="muted">—</span>}</td>
                  <td>{a.active ? <span className="pill pill-ok">Active</span> : <span className="pill pill-off">Deactivated</span>}</td>
                  <td className="actions-cell">
                    {String(a._id) !== String(userId) && (
                      <button
                        type="button"
                        className={`btn btn-small ${a.active ? 'btn-outline' : ''}`}
                        onClick={() => { setConfirmError(null); setConfirm(a); }}
                      >
                        {a.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={6} className="muted">No accounts match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {confirm && (
        <Modal title={confirm.active ? `Deactivate ${confirm.name}?` : `Reactivate ${confirm.name}?`} onClose={() => setConfirm(null)} busy={busy}>
          <p>
            {confirm.active
              ? 'They won’t be able to log in, and they’ll never be treated as on call, so no new tickets go to them. Nothing is deleted, and you can reactivate the account later.'
              : 'They’ll be able to log in again, and can be scheduled and assigned tickets.'}
          </p>
          <ErrorList error={confirmError} />
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)} disabled={busy} autoFocus>Cancel</button>
            <button type="button" className={`btn ${confirm.active ? 'btn-danger' : ''}`} onClick={toggleActive} disabled={busy}>
              {busy ? 'Saving…' : confirm.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
