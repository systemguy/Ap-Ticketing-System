import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createService, createTeam, deleteService, deleteTeam, getOverview, listAccounts, listServices,
  moveService, restoreService, restoreTeam, setAccountActive, setAccountRole, setAccountTeam, setTeamLead,
} from '../../api/admin';
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

const typeOf = (u) => (u.role === 'admin' ? 'Admin' : u.role === 'auditor' ? 'Auditor' : u.team ? 'Responder' : 'Reporter');
const roleOf = (u) => (u.role === 'admin' || u.role === 'auditor' ? u.role : 'standard');
// "Deleted by Avery Admin on Nov 18"
const deletedNote = (x) => `Deleted${x.deletedBy ? ` by ${x.deletedBy.name}` : ''}${x.deletedAt ? ` on ${formatTime(x.deletedAt, 'date')}` : ''}`;

// Admin portal: every team at a glance, who leads it and who is on call, its services, and every
// account. Deleting anything here is a soft delete: it leaves the lists people pick from but stays
// in history, and it's refused (with the reasons listed) until whatever depends on it is moved.
export default function AdminPage() {
  const navigate = useNavigate();
  const { logout, userId } = useSession();
  const [overview, setOverview] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [services, setServices] = useState([]);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState({}); // "lead:teamId" / "team:userId" / "role:userId" / "svc:serviceId" -> value
  const [saving, setSaving] = useState(null);
  const [confirm, setConfirm] = useState(null); // { title, body, label, danger, run }
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [newTeam, setNewTeam] = useState('');
  const [newService, setNewService] = useState({ name: '', team: '' });

  const handleAuth = useCallback((err) => {
    if (err?.status !== 401) return false;
    logout();
    navigate('/login', { replace: true });
    return true;
  }, [logout, navigate]);

  const load = useCallback(async () => {
    try {
      const [o, a, s] = await Promise.all([getOverview(), listAccounts(), listServices()]);
      setOverview(o);
      setAccounts(a);
      setServices(s);
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
      if (filter === 'reporters' && (a.team || ['admin', 'auditor'].includes(a.role) || !a.active)) return false;
      if (filter === 'admins' && !(['admin', 'auditor'].includes(a.role) && a.active)) return false;
      if (filter === 'deactivated' && a.active) return false;
      return !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
    });
  }, [accounts, filter, query]);

  const draft = (key, current) => drafts[key] ?? current;
  const setDraft = (key, value) => setDrafts((d) => ({ ...d, [key]: value }));

  // Runs one change, shows the result, reloads. Errors go to the flash line.
  async function save(key, action, success) {
    setSaving(key);
    setFlash(null);
    try {
      const res = await action();
      setFlash({ ok: true, text: success(res) });
      setDrafts((d) => ({ ...d, [key]: undefined }));
      await load();
      return true;
    } catch (err) {
      if (!handleAuth(err)) setFlash({ ok: false, text: err.list?.length > 1 ? `${err.message} ${err.list.slice(1).join(' ')}` : err.message });
      return false;
    } finally {
      setSaving(null);
    }
  }

  // Deletes and restores go through a confirmation; refusals show their reasons in the dialog
  async function runConfirm() {
    setBusy(true);
    setConfirmError(null);
    try {
      const text = await confirm.run();
      setFlash({ ok: true, text });
      setConfirm(null);
      await load();
    } catch (err) {
      if (!handleAuth(err)) setConfirmError(err);
    } finally {
      setBusy(false);
    }
  }
  const ask = (c) => { setConfirmError(null); setConfirm(c); };

  if (error) {
    return (
      <main className="page page-wide">
        <h1>Admin portal</h1>
        <ErrorList error={error} />
      </main>
    );
  }
  if (!overview) return <main className="page page-wide"><p className="muted">Loading the admin portal…</p></main>;

  const { counts, teams, unownedServices, deletedTeams = [] } = overview;
  const teamNames = teams.map((t) => t.name);

  return (
    <main className="page page-wide admin">
      <p className="eyebrow">Administration</p>
      <h1>Admin portal</h1>
      <p className="lede">Teams, their leads and who is on call right now, their services, and every account in the system.</p>

      <div className="stat-row">
        <div className="stat"><span className="stat-value">{counts.activeTickets}</span><span className="stat-label">Active tickets</span></div>
        <div className={`stat ${counts.unassignedTickets ? 'stat-warn' : ''}`}><span className="stat-value">{counts.unassignedTickets}</span><span className="stat-label">Unassigned</span></div>
        <div className={`stat ${counts.teamsWithoutOnCall ? 'stat-warn' : ''}`}><span className="stat-value">{counts.teamsWithoutOnCall}</span><span className="stat-label">Teams with no one on call</span></div>
        <div className="stat"><span className="stat-value">{counts.staff}</span><span className="stat-label">Active responders</span></div>
      </div>

      {flash && <p className={`flash ${flash.ok ? 'flash-ok' : 'flash-error'}`} role="status">{flash.text}</p>}

      {/* ---------- Teams ---------- */}
      <section className="admin-section" aria-labelledby="teams-heading">
        <div className="section-head">
          <h2 id="teams-heading">Teams</h2>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await save('new-team', () => createTeam(newTeam.trim()), (r) => `${r.team.name} was created. Choose its lead below.`)) setNewTeam('');
            }}
          >
            <input className="search-input" placeholder="New team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} aria-label="New team name" />
            <button type="submit" className="btn btn-small" disabled={!newTeam.trim() || saving === 'new-team'}>Add team</button>
          </form>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Team</th><th>Team lead</th><th>On call now</th><th>Scheduled until</th><th>Services</th><th></th></tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const key = `lead:${t._id}`;
                const current = t.lead?._id ? String(t.lead._id) : '';
                const value = draft(key, current);
                return (
                  <tr key={t._id}>
                    <td>
                      <Link to={`/schedule/${encodeURIComponent(t.name)}`} className="team-name">{t.name}</Link>
                      <div className="muted">{t.staff} responder{t.staff === 1 ? '' : 's'}</div>
                    </td>
                    <td>
                      <div className="lead-picker">
                        <select className="select-compact" value={value} onChange={(e) => setDraft(key, e.target.value)} aria-label={`${t.name} team lead`}>
                          {!current && <option value="">No lead</option>}
                          {leadOptions.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.team})</option>)}
                        </select>
                        {value !== current && (
                          <button type="button" className="btn btn-small" disabled={saving === key}
                            onClick={() => save(key, () => setTeamLead(t._id, value), (r) => `${r.team.lead.name} now leads ${t.name}.`)}>
                            {saving === key ? 'Saving…' : 'Save'}
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
                    <td className="actions-cell">
                      <button type="button" className="btn btn-small btn-outline" onClick={() => ask({
                        title: `Delete ${t.name}?`,
                        body: `${t.name} leaves every list, but its past incidents, shifts and history stay. A team can only be deleted once it owns no services, has no members and has no upcoming shifts.`,
                        label: 'Delete team', danger: true,
                        run: async () => { await deleteTeam(t._id); return `${t.name} was deleted.`; },
                      })}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {deletedTeams.map((t) => (
                <tr key={t._id} className="row-inactive">
                  <td><span className="person-name">{t.name}</span></td>
                  <td colSpan={4} className="muted">{deletedNote(t)}</td>
                  <td className="actions-cell">
                    <button type="button" className="btn btn-small" onClick={() => ask({
                      title: `Restore ${t.name}?`, body: `${t.name} comes back in every list. Choose its lead and give it services afterwards.`, label: 'Restore',
                      run: async () => { await restoreTeam(t._id); return `${t.name} was restored.`; },
                    })}>Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unownedServices.length > 0 && (
          <p className="admin-note">
            <b>Services with no owning team:</b> {unownedServices.map(serviceLabel).join(', ')}. Tickets for these can’t be assigned to anyone.
          </p>
        )}
      </section>

      {/* ---------- Services ---------- */}
      <section className="admin-section" aria-labelledby="services-heading">
        <div className="section-head">
          <h2 id="services-heading">Services</h2>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await save('new-service', () => createService(newService.name.trim(), newService.team),
                (r) => `${serviceLabel(r.service.name)} was added${r.service.team ? ` for ${r.service.team}` : ''}.`);
              if (ok) setNewService({ name: '', team: '' });
            }}
          >
            <input className="search-input" placeholder="New service name" value={newService.name}
              onChange={(e) => setNewService((s) => ({ ...s, name: e.target.value }))} aria-label="New service name" />
            <select className="select-compact" value={newService.team} onChange={(e) => setNewService((s) => ({ ...s, team: e.target.value }))} aria-label="Team for the new service">
              <option value="">No team</option>
              {teamNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="submit" className="btn btn-small" disabled={!newService.name.trim() || saving === 'new-service'}>Add service</button>
          </form>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Service</th><th>Handled by</th><th>Open incidents</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const key = `svc:${s._id}`;
                const current = s.team?.name || '';
                const value = draft(key, current);
                return (
                  <tr key={s._id} className={s.active ? '' : 'row-inactive'}>
                    <td><span className="person-name">{serviceLabel(s.name)}</span></td>
                    <td>
                      {s.active ? (
                        <div className="lead-picker">
                          <select className="select-compact" value={value} onChange={(e) => setDraft(key, e.target.value)} aria-label={`Team for ${s.name}`}>
                            <option value="">No team</option>
                            {[...new Set([...teamNames, ...(current ? [current] : [])])].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          {value !== current && (
                            <button type="button" className="btn btn-small" disabled={saving === key}
                              onClick={() => save(key, () => moveService(s._id, value), () => `${serviceLabel(s.name)} is now handled by ${value || 'no team'}.`)}>
                              {saving === key ? 'Saving…' : 'Save'}
                            </button>
                          )}
                        </div>
                      ) : (current || <span className="muted">—</span>)}
                    </td>
                    <td>{s.openIncidents}</td>
                    <td>{s.active ? <span className="pill pill-ok">Offered</span> : <span className="pill pill-off" title={deletedNote(s)}>{deletedNote(s)}</span>}</td>
                    <td className="actions-cell">
                      {s.active ? (
                        <button type="button" className="btn btn-small btn-outline" onClick={() => ask({
                          title: `Delete ${serviceLabel(s.name)}?`,
                          body: 'Residents can no longer report incidents for it. Its past incidents keep this service and still count in history. A service can only be deleted once it has no open incidents.',
                          label: 'Delete service', danger: true,
                          run: async () => { await deleteService(s._id); return `${serviceLabel(s.name)} was deleted.`; },
                        })}>Delete</button>
                      ) : (
                        <button type="button" className="btn btn-small" onClick={() => ask({
                          title: `Restore ${serviceLabel(s.name)}?`, body: 'Residents can report incidents for it again.', label: 'Restore',
                          run: async () => { await restoreService(s._id); return `${serviceLabel(s.name)} was restored.`; },
                        })}>Restore</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Accounts ---------- */}
      <section className="admin-section" aria-labelledby="people-heading">
        <div className="section-head">
          <h2 id="people-heading">Accounts</h2>
          <div className="people-tools">
            <input type="search" className="search-input" placeholder="Search name or email" value={query}
              onChange={(e) => setQuery(e.target.value)} aria-label="Search accounts" />
            <div className="segmented" role="group" aria-label="Filter accounts">
              {[['all', 'All'], ['staff', 'Responders'], ['reporters', 'Reporters'], ['admins', 'Admins & auditors'], ['deactivated', `Deleted (${counts.deactivated})`]].map(([v, label]) => (
                <button key={v} type="button" className={filter === v ? 'active' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Role</th><th>Team</th><th>Leads</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((a) => {
                const me = String(a._id) === String(userId);
                const teamKey = `team:${a._id}`;
                const roleKey = `role:${a._id}`;
                const teamValue = draft(teamKey, a.team || '');
                const roleValue = draft(roleKey, roleOf(a));
                return (
                  <tr key={a._id} className={a.active ? '' : 'row-inactive'}>
                    <td><div className="person-name">{a.name}</div><div className="muted">{a.email}</div></td>
                    <td>
                      {a.active && !me ? (
                        <div className="lead-picker">
                          <select className="select-compact" value={roleValue} onChange={(e) => setDraft(roleKey, e.target.value)} aria-label={`Role for ${a.name}`}>
                            <option value="standard">{a.team ? 'Responder' : 'Reporter'}</option>
                            <option value="admin">Admin</option>
                            <option value="auditor">Auditor (read-only)</option>
                          </select>
                          {roleValue !== roleOf(a) && (
                            <button type="button" className="btn btn-small" disabled={saving === roleKey}
                              onClick={() => save(roleKey, () => setAccountRole(a._id, roleValue), () => `${a.name}’s role was changed.`)}>Save</button>
                          )}
                        </div>
                      ) : typeOf(a)}
                    </td>
                    <td>
                      {a.active && a.role !== 'auditor' ? (
                        <div className="lead-picker">
                          <select className="select-compact" value={teamValue} onChange={(e) => setDraft(teamKey, e.target.value)} aria-label={`Team for ${a.name}`}>
                            <option value="">No team</option>
                            {[...new Set([...teamNames, ...(a.team ? [a.team] : [])])].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          {teamValue !== (a.team || '') && (
                            <button type="button" className="btn btn-small" disabled={saving === teamKey}
                              onClick={() => save(teamKey, () => setAccountTeam(a._id, teamValue || null), () => `${a.name} is now ${teamValue ? `on ${teamValue}` : 'on no team'}.`)}>Save</button>
                          )}
                        </div>
                      ) : (a.team || <span className="muted">—</span>)}
                    </td>
                    <td>{a.leads.length ? a.leads.join(', ') : <span className="muted">—</span>}</td>
                    <td>{a.active ? <span className="pill pill-ok">Active</span> : <span className="pill pill-off">{deletedNote(a)}</span>}</td>
                    <td className="actions-cell">
                      {!me && (a.active ? (
                        <button type="button" className="btn btn-small btn-outline" onClick={() => ask({
                          title: `Delete ${a.name}?`,
                          body: 'They won’t be able to log in or register again with this email, and they’ll never be on call. Their past work stays in history. Someone with upcoming shifts, a team to lead, an escalation level or open incidents can’t be deleted until those are given to someone else.',
                          label: 'Delete account', danger: true,
                          run: async () => { await setAccountActive(a._id, false); return `${a.name}’s account was deleted.`; },
                        })}>Delete</button>
                      ) : (
                        <button type="button" className="btn btn-small" onClick={() => ask({
                          title: `Restore ${a.name}?`, body: 'They’ll be able to log in again, and can be scheduled and assigned tickets.', label: 'Restore',
                          run: async () => { await setAccountActive(a._id, true); return `${a.name}’s account is active again.`; },
                        })}>Restore</button>
                      ))}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={6} className="muted">No accounts match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)} busy={busy}>
          <p>{confirm.body}</p>
          <ErrorList error={confirmError} />
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => setConfirm(null)} disabled={busy} autoFocus>Cancel</button>
            <button type="button" className={`btn ${confirm.danger ? 'btn-danger' : ''}`} onClick={runConfirm} disabled={busy}>
              {busy ? 'Saving…' : confirm.label}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
