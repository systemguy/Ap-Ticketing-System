import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listTickets } from '../api/tickets';
import { useSession } from '../context/SessionContext';
import { SEVERITIES, severityOf } from '../data/severity';
import { teamOf, useServices } from '../data/useServices';
import { formatDate, formatStatus, nameOf } from '../utils/incidents';

// Sprint 5: the auditor's view of every incident (all teams, all time, deleted ones too).
// Read-only: no status, edit or delete buttons here, and the timeline page hides its note box
// because the backend sends readOnly: true. Filtering happens on the backend (GET /tickets
// query parameters, see docs/sprint5-checkpoint.md), so the list always matches what an
// auditor is allowed to see.

// Dates are sent as YYYY-MM-DD in Central time, the same way the backend reads them
const ZONE = 'America/Chicago';
const todayCentral = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// Day arithmetic on YYYY-MM-DD strings (UTC noon, so DST never shifts the date)
function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  ['all', 'All time'],
  ['week', 'Last week'],
  ['month', 'This month'],
  ['year', 'This year'],
  ['custom', 'Custom'],
];

// The from/to dates for a preset. "all" sends no dates, so the backend returns everything.
function rangeFor(preset, custom) {
  const today = todayCentral();
  switch (preset) {
    case 'week': return { from: addDays(today, -6), to: today };
    case 'month': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'custom': return { from: custom.from, to: custom.to };
    default: return { from: '', to: '' };
  }
}

const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

// A row of checkable chips, with "Only these / All except these" for teams and services
function ChipFilter({ legend, options, selected, onChange, mode, onModeChange, render = (o) => o }) {
  return (
    <fieldset className="audit-filter">
      <legend>{legend}</legend>
      {onModeChange && (
        <select
          className="select-compact"
          aria-label={`${legend}: include or exclude`}
          value={mode}
          onChange={(e) => onModeChange(e.target.value)}
        >
          <option value="only">Only these</option>
          <option value="except">All except these</option>
        </select>
      )}
      <div className="audit-chips">
        {options.map((o) => {
          const value = typeof o === 'object' ? o.value : o;
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              className={`audit-chip ${on ? 'active' : ''} ${on && mode === 'except' ? 'audit-chip-except' : ''}`}
              aria-pressed={on}
              onClick={() => onChange(toggle(selected, value))}
            >
              {render(o)}
            </button>
          );
        })}
        {options.length === 0 && <span className="muted">None available</span>}
      </div>
    </fieldset>
  );
}

export default function AuditIncidents() {
  const navigate = useNavigate();
  const { logout } = useSession();
  const { byTeam, teams } = useServices();

  const [severity, setSeverity] = useState([]);
  const [teamSel, setTeamSel] = useState([]);
  const [teamMode, setTeamMode] = useState('only');
  const [serviceSel, setServiceSel] = useState([]);
  const [serviceMode, setServiceMode] = useState('only');
  const [preset, setPreset] = useState('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [showDeleted, setShowDeleted] = useState(true);

  const [incidents, setIncidents] = useState([]);
  const [knownServices, setKnownServices] = useState([]); // includes services that were deleted since
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = rangeFor(preset, custom);
  const customIncomplete = preset === 'custom' && (!custom.from || !custom.to);
  const customBackwards = preset === 'custom' && custom.from && custom.to && custom.from > custom.to;

  // What gets sent to GET /tickets
  const filters = useMemo(() => ({
    severity,
    [teamMode === 'only' ? 'team' : 'excludeTeam']: teamSel,
    [serviceMode === 'only' ? 'service' : 'excludeService']: serviceSel,
    from: range.from,
    to: range.to,
  }), [severity, teamSel, teamMode, serviceSel, serviceMode, range.from, range.to]);
  const filtersKey = JSON.stringify(filters);

  const handleAuthError = useCallback((err) => {
    if (err?.status !== 401) return false;
    logout();
    navigate('/login', { replace: true });
    return true;
  }, [logout, navigate]);

  useEffect(() => {
    if (customIncomplete || customBackwards) return undefined; // wait for a usable range
    let alive = true;
    setLoading(true);
    listTickets(JSON.parse(filtersKey))
      .then((tickets) => {
        if (!alive) return;
        setIncidents(tickets);
        setError('');
        // Remember every service we've seen, so deleted ones can still be filtered on
        setKnownServices((prev) => [...new Set([...prev, ...tickets.map((t) => t.service).filter(Boolean)])]);
      })
      .catch((err) => {
        if (alive && !handleAuthError(err)) setError(`Couldn't load incidents. ${err.message}`);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filtersKey, customIncomplete, customBackwards, handleAuthError]);

  const serviceOptions = useMemo(() => {
    const live = Object.values(byTeam).flat();
    return [...new Set([...live, ...knownServices, ...serviceSel])].sort((a, b) => a.localeCompare(b));
  }, [byTeam, knownServices, serviceSel]);
  const teamOptions = useMemo(() => [...new Set([...teams, ...teamSel])].sort(), [teams, teamSel]);

  const visible = showDeleted ? incidents : incidents.filter((i) => i.active !== false);
  const deletedCount = incidents.filter((i) => i.active === false).length;
  const anyFilter = severity.length || teamSel.length || serviceSel.length || preset !== 'all';

  function clearAll() {
    setSeverity([]);
    setTeamSel([]);
    setServiceSel([]);
    setTeamMode('only');
    setServiceMode('only');
    setPreset('all');
    setCustom({ from: '', to: '' });
  }

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <p className="eyebrow">Auditor · read-only</p>
          <h1>All Incidents</h1>
          <p className="lede">Every incident from every team, including resolved, closed and deleted ones. You can read them but not change them.</p>
        </div>
        <Link to="/tickets/new" className="btn">Report an Issue</Link>
      </div>

      <section className="card audit-filters" aria-label="Filters">
        <ChipFilter
          legend="Severity"
          options={SEVERITIES.map((s) => ({ value: s.value, label: `${s.value} · ${s.label}` }))}
          selected={severity}
          onChange={setSeverity}
          render={(o) => o.label}
        />
        <ChipFilter
          legend="Team"
          options={teamOptions}
          selected={teamSel}
          onChange={setTeamSel}
          mode={teamMode}
          onModeChange={setTeamMode}
        />
        <ChipFilter
          legend="Service"
          options={serviceOptions}
          selected={serviceSel}
          onChange={setServiceSel}
          mode={serviceMode}
          onModeChange={setServiceMode}
        />

        <fieldset className="audit-filter">
          <legend>Filed</legend>
          <div className="segmented" role="group" aria-label="Date range">
            {PRESETS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={preset === value ? 'active' : ''}
                aria-pressed={preset === value}
                onClick={() => setPreset(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="audit-dates">
              <label>
                From
                <input
                  type="date"
                  className="select-compact audit-date"
                  value={custom.from}
                  max={custom.to || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  className="select-compact audit-date"
                  value={custom.to}
                  min={custom.from || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                />
              </label>
            </div>
          )}
          {preset !== 'all' && preset !== 'custom' && (
            <p className="muted audit-range">{range.from} to {range.to} (Central time)</p>
          )}
          {customIncomplete && <p className="muted audit-range">Pick both dates to apply the range.</p>}
          {customBackwards && <p className="field-error">The start date must be on or before the end date.</p>}
        </fieldset>

        <div className="audit-filter-foot">
          <label className="checkbox">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
            Show deleted incidents{deletedCount ? ` (${deletedCount})` : ''}
          </label>
          {anyFilter ? (
            <button type="button" className="btn btn-outline btn-small" onClick={clearAll}>Clear filters</button>
          ) : null}
        </div>
      </section>

      {error && <p className="flash flash-error" role="alert">{error}</p>}

      <p className="muted audit-count" role="status">
        {loading ? 'Loading…' : `${visible.length} ${visible.length === 1 ? 'incident' : 'incidents'}`}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Issue</th>
              <th>Team · Service</th>
              <th>Severity</th>
              <th>Location</th>
              <th>Reported By</th>
              <th>Filed</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((incident) => {
              const sev = severityOf(incident.severity);
              const status = incident.status || 'Open';
              const deleted = incident.active === false;
              const team = teamOf(byTeam, incident.service);
              return (
                <tr key={incident._id} className={deleted ? 'row-deleted' : ''}>
                  <td className="mono">{String(incident._id).slice(-6).toUpperCase()}</td>
                  <td>
                    <div><Link to={`/incidents/${incident._id}/timeline`}>{incident.title || 'Untitled incident'}</Link></div>
                    <div className="tag-row">
                      {deleted && <span className="tag tag-deleted">Deleted</span>}
                      {incident.escalationExhaustedAt && <span className="tag tag-final">Final escalation</span>}
                    </div>
                  </td>
                  <td>
                    <div>{team || <span className="muted">No current team</span>}</div>
                    <div className="muted">{incident.service || incident.type}</div>
                  </td>
                  <td>
                    {sev ? (
                      <span className={`severity severity-${sev.value}`} title={sev.description}>{sev.value} · {sev.label}</span>
                    ) : '—'}
                  </td>
                  <td>{incident.unit}</td>
                  <td>{nameOf(incident.userPosted) || 'Unknown'}</td>
                  <td className="nowrap">{formatDate(incident.createdAt)}</td>
                  <td>
                    <span className={`status status-${status.toLowerCase()}`}>{formatStatus(status)}</span>
                    <div className="assignee muted">
                      {incident.assignedTo ? `→ ${nameOf(incident.assignedTo)}` : 'Unassigned'}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">No incidents match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
