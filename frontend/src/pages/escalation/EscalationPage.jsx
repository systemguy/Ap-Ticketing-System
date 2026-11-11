import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getPolicy, savePolicy } from '../../api/escalation';
import { getOnCall, listTeams } from '../../api/schedule';
import { useSession } from '../../context/SessionContext';
import { ErrorList } from '../../components/Modal';
import { SEVERITIES } from '../../data/severity';
import { formatTime } from '../../data/shifts';
import '../schedule/Schedule.css';
import '../admin/Admin.css';
import './Escalation.css';

// Reordered so Critical (Sev 4) is first in the list, down to Low (Sev 1)
const COLUMNS = [...SEVERITIES]
  .reverse()
  .map((s) => ({ ...s, key: ['low', 'moderate', 'high', 'critical'][s.value - 1] }));

const PRESETS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440, 2880, 4320, 7200, 10080];

export function formatDuration(minutes) {
  const m = Number(minutes) || 0;
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} h`);
  if (mins) parts.push(`${mins} min`);
  return parts.join(' ') || '0 min';
}

function untilText(at, now) {
  const minutes = Math.ceil((new Date(at) - now) / 60000);
  return minutes <= 0 ? 'any minute now' : `in ${formatDuration(minutes)}`;
}

// Convert Level 1 escTime into severity multipliers
const computeAfter = (baseTime) => ({
  low: baseTime * 4,
  moderate: baseTime * 3,
  high: baseTime * 2,
  critical: baseTime * 1,
});

export default function EscalationPage() {
  const { team: teamParam } = useParams();
  const navigate = useNavigate();
  const { isAdmin, leads, myTeams, loadingUser, logout } = useSession();

  const [allTeams, setAllTeams] = useState([]);
  const [data, setData] = useState(null);
  const [onCall, setOnCall] = useState(null);
  const [levels, setLevels] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const handleAuth = useCallback((err) => {
    if (err?.status !== 401) return false;
    logout();
    navigate('/login', { replace: true });
    return true;
  }, [logout, navigate]);

  useEffect(() => {
    listTeams().then(setAllTeams).catch((err) => handleAuth(err));
  }, [handleAuth]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(() => {
    const names = isAdmin ? allTeams.map((t) => t.name) : myTeams;
    return names.map((n) => allTeams.find((t) => t.name === n) || { name: n, lead: null });
  }, [isAdmin, allTeams, myTeams]);
  const team = visible.find((t) => t.name.toLowerCase() === String(teamParam || '').toLowerCase());

  // Converts backend team data into UI levels
  const resetForm = useCallback((d) => {
    const baseTime = d.team?.escTime ?? 5;
    const responders = d.team?.responders || [];
    const after = computeAfter(baseTime);

    const draftLevels = responders.map((r) => ({
      target: `person:${r._id || r}`,
      after,
    }));

    // Fallback level to lead if lead exists or no responders configured
    if (d.team?.lead || draftLevels.length === 0) {
      draftLevels.push({ target: 'lead', after });
    }

    setLevels(draftLevels);
    setEnabled(true);
  }, []);

  const load = useCallback(async ({ keepForm = false } = {}) => {
    if (!team) return;
    try {
      const [d, oc] = await Promise.all([getPolicy(team.name), getOnCall(team.name).catch(() => null)]);
      setData(d);
      setOnCall(oc);
      if (!keepForm) resetForm(d);
      setLoadError(null);
    } catch (err) {
      if (!handleAuth(err)) setLoadError(err);
    }
  }, [team?.name, handleAuth, resetForm]);

  useEffect(() => {
    setData(null);
    setFlash(null);
    setSaveError(null);
    load();
  }, [load]);

  const saved = useMemo(() => {
    if (!data?.team) return [];
    const baseTime = data.team.escTime ?? 5;
    const responders = data.team.responders || [];
    const after = computeAfter(baseTime);
    const res = responders.map((r) => ({ target: `person:${r._id || r}`, after }));
    if (data.team.lead || res.length === 0) res.push({ target: 'lead', after });
    return res;
  }, [data]);

  const dirty = Boolean(data) && JSON.stringify(levels) !== JSON.stringify(saved);

  useEffect(() => {
    const t = setInterval(() => load({ keepForm: true }), 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (loadingUser) return <main className="page"><p className="muted">Loading…</p></main>;
  if (!visible.length && allTeams.length) {
    return (
      <main className="page">
        <h1>Escalation policy</h1>
        <p className="lede">You’re not on a team yet, so there’s no escalation policy to show.</p>
      </main>
    );
  }
  if (visible.length && !team) return <Navigate to={`/escalation/${encodeURIComponent(visible[0].name)}`} replace />;
  if (!team) return <main className="page"><p className="muted">Loading…</p></main>;

  const canEdit = Boolean(data?.canEdit);
  const lead = data?.team?.lead;
  const candidates = data?.candidates || [];
  const personName = (id) => candidates.find((c) => String(c._id) === String(id))?.name;

  function reachNow(target) {
    if (target === 'on-call') {
      return onCall?.responder
        ? { name: onCall.responder.name, note: onCall.shift ? `on call until ${formatTime(onCall.shift.end, true)}` : 'on call' }
        : { name: null, note: 'Nobody is on call right now' };
    }
    if (target === 'lead') return lead ? { name: lead.name, note: 'team lead' } : { name: null, note: 'This team has no lead' };
    const id = target.split(':')[1];
    const name = personName(id);
    return name ? { name, note: 'chosen person' } : { name: null, note: 'Choose a person' };
  }

  const targetLabel = (target) => {
    if (target === 'on-call') return 'Whoever is on call';
    if (target === 'lead') return 'Team lead';
    return personName(target.split(':')[1]) || 'A specific person';
  };

  function summary(key) {
    const who = (t) => (t === 'on-call' ? 'whoever is on call' : t === 'lead' ? `the team lead${lead ? ` (${lead.name})` : ''}` : targetLabel(t));
    const text = levels
      .map((l, i) => `${who(l.target)} ${i === 0 ? 'after' : ''} ${formatDuration(l.after[key])}${i ? ' later' : ''}`.replace(/\s+/g, ' '))
      .join(', then ');
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  }

  // Updates Level 1 time and automatically recalculates down the chain
  function updateTime(newCriticalMinutes) {
    const baseTime = Number(newCriticalMinutes);
    const newAfter = computeAfter(baseTime);
    setLevels((ls) => ls.map((l) => ({ ...l, after: newAfter })));
  }

  function updateTarget(i, target) {
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, target } : l)));
  }

  function addLevel() {
    const baseTime = levels[0]?.after?.critical ?? 5;
    const after = computeAfter(baseTime);
    setLevels((ls) => [...ls, { target: lead ? 'lead' : 'on-call', after }]);
  }

  function move(i, by) {
    setLevels((ls) => {
      const next = [...ls];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setFlash(null);

    try {
      // 1. Extract base escTime from level 1 critical
      const escTime = levels[0]?.after?.critical ?? 5;

      // 2. Extract responders list (only person targets, in order)
      const responders = levels
        .filter((l) => l.target.startsWith('person:'))
        .map((l) => l.target.split(':')[1]);

      // 3. Post simple backend format matching PATCH controller
      const res = await savePolicy(team.name, { escTime, responders });
      
      // Update data and reset form state
      setData((prev) => ({ ...prev, team: res.team }));
      resetForm({ team: res.team, candidates: data?.candidates });
      setFlash({ ok: true, text: res.message || 'Escalation settings updated successfully.' });
    } catch (err) {
      if (!handleAuth(err)) setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  const tickets = data?.tickets || [];

  return (
    <main className="page page-wide escalation">
      <div className="page-head">
        <div>
          <p className="eyebrow">Escalation policy</p>
          <h1>{team.name}</h1>
          <p className="lede">
            When a ticket isn’t acknowledged in time, it moves to the next level and is assigned to that
            level’s person. Critical tickets move faster than low ones.
          </p>
        </div>
      </div>

      {visible.length > 1 && (
        <nav className="team-tabs" aria-label="Teams">
          {visible.map((t) => (
            <NavLink key={t.name} to={`/escalation/${encodeURIComponent(t.name)}`}>
              {t.name}
              {leads.includes(t.name) && <span className="tab-badge">you lead</span>}
            </NavLink>
          ))}
        </nav>
      )}

      {loadError && <ErrorList error={loadError} />}
      {!data && !loadError && <p className="muted">Loading the escalation policy…</p>}

      {data && (
        <>
          <section className="oncall-banner" aria-live="polite">
            <span className="oncall-dot" aria-hidden="true" />
            <p>
              <b>Escalation is on: {levels.length} level{levels.length === 1 ? '' : 's'}.</b>
            </p>
          </section>

          {flash && <p className={`flash ${flash.ok ? 'flash-ok' : 'flash-error'}`} role="status">{flash.text}</p>}

          <form onSubmit={save} className="admin-section">
            <div className="section-head">
              <h2>Escalation levels</h2>
            </div>

            <div className="table-wrap">
              <table className="esc-table">
                <thead>
                  <tr>
                    <th scope="col">Level</th>
                    <th scope="col">Assigned to</th>
                    <th scope="col">Right now that’s</th>
                    {COLUMNS.map((c) => (
                      <th scope="col" key={c.key} className="esc-sev-head">
                        <span className={`sev-dot sev-${c.key}`} aria-hidden="true" />{c.label}
                      </th>
                    ))}
                    {canEdit && <th scope="col"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {levels.map((l, i) => {
                    const reach = reachNow(l.target);
                    return (
                      <tr key={i}>
                        <th scope="row" className="esc-level">
                          <span className="esc-level-num">{i + 1}</span>
                          <span className="esc-level-when">{i === 0 ? 'after filing' : `after level ${i}`}</span>
                        </th>
                        <td>
                          {canEdit ? (
                            <select
                              className="select-compact esc-who"
                              value={l.target}
                              onChange={(e) => updateTarget(i, e.target.value)}
                              aria-label={`Level ${i + 1}: who gets the ticket`}
                            >
                              <option value="on-call">Whoever is on call</option>
                              <option value="lead">Team lead{lead ? ` (${lead.name})` : ''}</option>
                              {candidates.map((p) => (
                                <option key={p._id} value={`person:${p._id}`}>{p.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="esc-who-text">{targetLabel(l.target)}</span>
                          )}
                        </td>
                        <td className="esc-now">
                          {reach.name
                            ? <><span className="pill pill-ok">{reach.name}</span><div className="muted">{reach.note}</div></>
                            : <span className="pill pill-warn">{reach.note}</span>}
                        </td>
                        {COLUMNS.map((c) => (
                          <td key={c.key} className="esc-time">
                            {canEdit && i === 0 ? (
                              <select
                                className="select-compact"
                                value={l.after[c.key]}
                                onChange={(e) => {
                                  const mult = c.key === 'low' ? 4 : c.key === 'moderate' ? 3 : c.key === 'high' ? 2 : 1;
                                  updateTime(Number(e.target.value) / mult);
                                }}
                                aria-label={`Level ${i + 1}, ${c.label} tickets: time frame`}
                              >
                                {[...new Set([...PRESETS, l.after[c.key]])].sort((a, b) => a - b).map((m) => (
                                  <option key={m} value={m}>{formatDuration(m)}</option>
                                ))}
                              </select>
                            ) : (
                              formatDuration(l.after[c.key])
                            )}
                          </td>
                        ))}
                        {canEdit && (
                          <td className="esc-actions">
                            <button type="button" className="icon-button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move level ${i + 1} up`}>↑</button>
                            <button type="button" className="icon-button" onClick={() => move(i, 1)} disabled={i === levels.length - 1} aria-label={`Move level ${i + 1} down`}>↓</button>
                            <button type="button" className="icon-button icon-remove" onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))} disabled={levels.length === 1} aria-label={`Remove level ${i + 1}`} title="Remove level">✕</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="muted esc-foot">
              Level 1’s time frame is customizable; subsequent level timing is automatically calculated based on severity multipliers.
            </p>

            <div className="esc-summary card">
              <h3 className="card-title">In plain words</h3>
              <ul>
                {COLUMNS.map((c) => (
                  <li key={c.key}>
                    <b>{c.label}:</b> {summary(c.key)}
                  </li>
                ))}
              </ul>
            </div>

            <ErrorList error={saveError} />

            {canEdit && (
              <div className="esc-buttons">
                <button type="submit" className="btn" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save policy'}</button>
                <button type="button" className="btn btn-outline" onClick={addLevel} disabled={saving}>+ Add level</button>
                {dirty && (
                  <button type="button" className="link-button" onClick={() => { resetForm(data); setSaveError(null); }} disabled={saving}>
                    Discard changes
                  </button>
                )}
              </div>
            )}
          </form>

          <section className="admin-section" aria-labelledby="esc-tickets">
            <div className="section-head">
              <h2 id="esc-tickets">Waiting to be acknowledged</h2>
              <Link to="/incidents" className="text-link">Open the team queue →</Link>
            </div>
            {tickets.length === 0 ? (
              <p className="muted">No {team.name} tickets are waiting. Every open ticket has been acknowledged.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Ticket</th><th>Severity</th><th>Assigned to</th><th>Level</th><th>Next escalation</th></tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => {
                      const sev = COLUMNS.find((c) => c.value === Number(t.severity));
                      return (
                        <tr key={t._id}>
                          <td>
                            <Link to={`/incidents/${t._id}/timeline`} className="person-name">{t.title}</Link>
                            <div className="muted">Unit {t.unit} · filed {formatTime(t.createdAt, 'date')}</div>
                          </td>
                          <td>{sev && <><span className={`sev-dot sev-${sev.key}`} aria-hidden="true" />{sev.label}</>}</td>
                          <td>{t.assignedTo ? t.assignedTo.name : <span className="pill pill-warn">Unassigned</span>}</td>
                          <td>{t.level ? `Level ${t.level}` : <span className="muted">Not yet</span>}</td>
                          <td>
                            {t.next ? (
                              <>
                                <b>{untilText(t.next.dueAt, now)}</b>{' '}
                                <span className="muted">({formatTime(t.next.dueAt, true)})</span>
                              </>
                            ) : (
                              <span className="muted">Pending</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}