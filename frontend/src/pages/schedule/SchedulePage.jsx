import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { addShifts, changeShift, getOnCall, listShifts, listStaff, listTeams, removeShift } from '../../api/schedule';
import { useSession } from '../../context/SessionContext';
import Modal, { ErrorList } from '../../components/Modal';
import {
  REPEAT_OPTIONS, SLOTS, addDays, centralHour, formatDay, formatTime, slotOf, todayKey, weekDays, weekStart,
} from '../../data/shifts';
import './Schedule.css';

// Why nobody is on call, in plain words (reasons come from whoIsOnCall on the backend)
const NO_ONE = {
  'no-schedule': 'This team has no on-call schedule yet.',
  'schedule-ended': 'This team’s schedule has ended. Nobody is on call.',
  'not-covered': 'Nobody is covering this team right now.',
  'responder-inactive': 'The person on call has a deactivated account.',
};

// One page per team: who's on call now and a week of shifts.
// Responders see the teams they're on; team leads also see the teams they lead and can
// add, change or remove shifts for them. Admins see and edit every team.
export default function SchedulePage() {
  const { team: teamParam } = useParams();
  const navigate = useNavigate();
  const { isAdmin, leads, myTeams, loadingUser, logout } = useSession();

  const [allTeams, setAllTeams] = useState([]); // [{ _id, name, lead }]
  const [anchor, setAnchor] = useState(() => weekStart(todayKey()));
  const [shifts, setShifts] = useState([]);
  const [onCall, setOnCall] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [creating, setCreating] = useState(null); // prefill for the New shift form, or null
  const [editing, setEditing] = useState(null); // shift being changed, or null
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

  // Keep "now" fresh so the highlighted shift moves on its own
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Teams this person may view: admins see all; others their home team plus teams they lead
  const visible = useMemo(() => {
    const names = isAdmin ? allTeams.map((t) => t.name) : myTeams;
    return names.map((n) => allTeams.find((t) => t.name === n) || { name: n, lead: null });
  }, [isAdmin, allTeams, myTeams]);

  const team = visible.find((t) => t.name.toLowerCase() === String(teamParam || '').toLowerCase());
  const canEdit = Boolean(team) && (isAdmin || leads.includes(team.name));
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const today = todayKey(now);

  const load = useCallback(async () => {
    if (!team) return;
    setLoading(true);
    try {
      const [list, current] = await Promise.all([
        listShifts({ team: team.name, from: days[0], to: days[6] }),
        getOnCall(team.name),
      ]);
      setShifts(list);
      setOnCall(current);
      setLoadError(null);
    } catch (err) {
      if (!handleAuth(err)) setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [team?.name, days, handleAuth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  // The Employee dropdowns: people who can cover this team (members and its lead)
  useEffect(() => {
    if (!canEdit) return;
    listStaff()
      .then((list) => setStaff(list))
      .catch((err) => handleAuth(err));
  }, [canEdit, handleAuth]);
  const eligible = staff.filter((p) => team && (p.departments || []).includes(team.name));

  if (loadingUser) return <main className="page"><p className="muted">Loading…</p></main>;
  if (!visible.length && allTeams.length) {
    return (
      <main className="page">
        <h1>On-call schedule</h1>
        <p className="lede">You’re not on a team yet, so there’s no schedule to show.</p>
      </main>
    );
  }
  // /schedule with no team, or a team this person can't see: go to their first team
  if (visible.length && !team) return <Navigate to={`/schedule/${encodeURIComponent(visible[0].name)}`} replace />;
  if (!team) return <main className="page"><p className="muted">Loading…</p></main>;

  const cell = (day, slot) => shifts.find((s) => s.date === day && s.shift === slot);
  const isNow = (s) => new Date(s.start) <= now && now < new Date(s.end);
  const isOver = (s) => new Date(s.end) <= now;
  const slotOver = (day, slot) => {
    // An empty slot in the past can't be filled any more
    const ends = { morning: [day, 15], evening: [day, 23], overnight: [addDays(day, 1), 7] }[slot];
    return ends[0] < today || (ends[0] === today && centralHour(now) >= ends[1]);
  };

  const rangeLabel = `${formatDay(days[0], { month: 'short', day: 'numeric' })} – ${formatDay(days[6], { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <main className="page page-wide schedule">
      <div className="page-head">
        <div>
          <p className="eyebrow">On-call schedule</p>
          <h1>{team.name}</h1>
          <p className="lede">
            {team.lead ? <>Team lead: <b>{team.lead.name}</b>. </> : 'This team has no lead yet. '}
            Times are Central (Austin).
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn" onClick={() => setCreating({ date: today < days[0] ? days[0] : today })}>
            + New shift
          </button>
        )}
      </div>

      {visible.length > 1 && (
        <nav className="team-tabs" aria-label="Teams">
          {visible.map((t) => (
            <NavLink key={t.name} to={`/schedule/${encodeURIComponent(t.name)}`}>
              {t.name}
              {leads.includes(t.name) && <span className="tab-badge">you lead</span>}
            </NavLink>
          ))}
        </nav>
      )}

      <section className={`oncall-banner ${onCall?.responder ? '' : 'oncall-none'}`} aria-live="polite">
        <span className="oncall-dot" aria-hidden="true" />
        {onCall?.responder ? (
          <p>
            <b>On call now: {onCall.responder.name}</b>
            {onCall.shift && <> · {slotOf(onCall.shift.shift)?.label} shift until {formatTime(onCall.shift.end, true)}</>}
          </p>
        ) : (
          <p><b>{onCall ? NO_ONE[onCall.reason] || 'Nobody is on call right now.' : 'Checking who’s on call…'}</b></p>
        )}
      </section>

      {flash && <p className={`flash ${flash.ok ? 'flash-ok' : 'flash-error'}`} role="status">{flash.text}</p>}
      {loadError && <ErrorList error={loadError} />}

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button type="button" className="btn btn-outline btn-small" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Previous week">←</button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => setAnchor(weekStart(today))}>This week</button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Next week">→</button>
          <span className="calendar-range">{rangeLabel}</span>
        </div>
        {loading && <span className="muted">Loading…</span>}
      </div>

      <div className="table-wrap">
        <table className="calendar">
          <thead>
            <tr>
              <th scope="col" className="calendar-corner">Shift</th>
              {days.map((d) => (
                <th scope="col" key={d} className={d === today ? 'is-today' : ''}>
                  <span className="calendar-dow">{formatDay(d, { weekday: 'short' })}</span>
                  <span className="calendar-date">{formatDay(d, { day: 'numeric' })}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot.id}>
                <th scope="row" className="calendar-shift">
                  <span className={`shift-chip shift-${slot.id}`}>{slot.label}</span>
                  <span className="muted">{slot.hours}</span>
                </th>
                {days.map((d) => {
                  const s = cell(d, slot.id);
                  const over = s ? isOver(s) : slotOver(d, slot.id);
                  return (
                    <td key={d} className={`${d === today ? 'is-today' : ''} ${!s && !over ? 'is-gap' : ''}`}>
                      {s ? (
                        canEdit && !over ? (
                          <button
                            type="button"
                            className={`person person-button ${isNow(s) ? 'is-now' : ''}`}
                            onClick={() => setEditing(s)}
                            title="Change or remove this shift"
                          >
                            {s.responder?.name || 'Unknown'}
                            {isNow(s) && <span className="now-label">on call</span>}
                          </button>
                        ) : (
                          <span className={`person ${isNow(s) ? 'is-now' : ''} ${over ? 'is-over' : ''}`}>
                            {s.responder?.name || 'Unknown'}
                            {isNow(s) && <span className="now-label">on call</span>}
                          </span>
                        )
                      ) : over ? (
                        <span className="muted">—</span>
                      ) : canEdit ? (
                        <button type="button" className="add-slot" onClick={() => setCreating({ date: d, slot: slot.id })}>
                          + Add
                        </button>
                      ) : (
                        <span className="gap-label">No one</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted schedule-foot">
        {canEdit
          ? 'Click a name to change who covers that shift or remove it. Empty slots can be filled with + Add.'
          : `Only ${team.lead ? team.lead.name : 'the team lead'} can change this schedule.`}
        {' '}Need the tickets? <Link to="/incidents">Open the team queue</Link>.
      </p>

      {creating && (
        <NewShiftDialog
          team={team}
          staff={eligible}
          initial={creating}
          today={today}
          onClose={() => setCreating(null)}
          onSaved={(text) => {
            setCreating(null);
            setFlash({ ok: true, text });
            load();
          }}
        />
      )}

      {editing && (
        <EditShiftDialog
          shift={editing}
          staff={eligible}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setFlash({ ok: true, text });
            load();
          }}
        />
      )}
    </main>
  );
}

function NewShiftDialog({ team, staff, initial, today, onClose, onSaved }) {
  const [date, setDate] = useState(initial.date);
  const [slot, setSlot] = useState(initial.slot || 'morning');
  const [employeeId, setEmployeeId] = useState('');
  const [repeat, setRepeat] = useState('once');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const dates = REPEAT_OPTIONS.find((r) => r.id === repeat).dates(date);
      const res = await addShifts(dates.map((d) => ({ team: team.name, employeeId, date: d, shift: slot })));
      const who = staff.find((p) => p._id === employeeId)?.name || 'They';
      const n = res.added?.length || 0;
      let text = `${who}: ${n} ${slotOf(slot).label.toLowerCase()} shift${n === 1 ? '' : 's'} added to ${team.name}.`;
      if (res.skipped?.length) text += ` ${res.skipped.length} already on the schedule.`;
      onSaved(text);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title={`New shift · ${team.name}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="ns-date">Date</label>
            <input id="ns-date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="ns-slot">Shift</label>
            <select id="ns-slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
              {SLOTS.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.hours})</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="ns-who">Covered by</label>
          <select id="ns-who" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
            <option value="" disabled>Choose a responder</option>
            {staff.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}{p.department && p.department !== team.name ? ` (lead, ${p.department})` : ''}
              </option>
            ))}
          </select>
          {!staff.length && <p className="field-hint">Loading the team roster…</p>}
        </div>
        <div className="form-group">
          <label htmlFor="ns-repeat">Repeat</label>
          <select id="ns-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
            {REPEAT_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <p className="field-hint">The schedule is checked before anything is saved: no gaps, no double-booking, and nobody on two teams at once.</p>
        </div>
        <ErrorList error={error} />
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy || !employeeId}>{busy ? 'Saving…' : 'Add shift'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditShiftDialog({ shift, staff, onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState(String(shift.employeeId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const label = `${slotOf(shift.shift)?.label} shift, ${formatDay(shift.date, { weekday: 'long', month: 'short', day: 'numeric' })}`;
  const options = staff.some((p) => p._id === String(shift.employeeId))
    ? staff
    : [{ _id: String(shift.employeeId), name: shift.responder?.name || 'Current responder' }, ...staff];

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await changeShift(shift._id, employeeId);
      onSaved(`${label}: now covered by ${updated.responder?.name || 'the new responder'}.`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await removeShift(shift._id);
      onSaved(`${label} removed.`);
    } catch (err) {
      setError(err);
      setBusy(false);
      setConfirmRemove(false);
    }
  }

  return (
    <Modal title={label} onClose={onClose} busy={busy}>
      <form onSubmit={save}>
        <div className="form-group">
          <label htmlFor="es-who">Covered by</label>
          <select id="es-who" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {options.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
        <ErrorList error={error} />
        {confirmRemove ? (
          <div className="confirm-remove">
            <p>Remove this shift? It’s refused if it would leave {shift.team?.name || 'the team'} without coverage.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmRemove(false)} disabled={busy}>Keep it</button>
              <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove shift'}</button>
            </div>
          </div>
        ) : (
          <div className="modal-actions modal-actions-split">
            <button type="button" className="link-button" onClick={() => setConfirmRemove(true)} disabled={busy}>Remove shift</button>
            <span>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="btn" disabled={busy || employeeId === String(shift.employeeId)}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </span>
          </div>
        )}
      </form>
    </Modal>
  );
}
