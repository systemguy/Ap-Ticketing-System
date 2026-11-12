import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSummary, timed } from '../api/metrics';
import { useSession } from '../context/SessionContext';
import { SEVERITIES } from '../data/severity';
import { formatDate } from '../utils/incidents';
import './admin/Admin.css';

// Requirement change: uptime and speed (log in, submitting, resolving, analytics).
// Refreshes every 30 seconds.

const WINDOWS = [['24h', 'Last 24 hours'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']];

// 90 -> "1 h 30 min"
function minutesText(m) {
  if (m == null) return '—';
  const v = Math.round(m);
  if (v < 1) return '< 1 min';
  const d = Math.floor(v / 1440);
  const h = Math.floor((v % 1440) / 60);
  const min = v % 60;
  return [d && `${d} d`, h && `${h} h`, min && `${min} min`].filter(Boolean).join(' ');
}

const ms = (v) => (v == null ? '—' : `${v.toLocaleString()} ms`);

function Verdict({ ok, none }) {
  if (none) return <span className="pill pill-muted">No data yet</span>;
  return ok ? <span className="pill pill-ok">Meets target</span> : <span className="pill pill-bad">Misses target</span>;
}

export default function PerformancePage() {
  const navigate = useNavigate();
  const { isAdmin, isLead, loadingUser, logout } = useSession();
  const [range, setRange] = useState('24h');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [waited, setWaited] = useState(null); // how long the last refresh took

  const load = useCallback(async () => {
    try {
      const start = performance.now();
      const d = await timed('analytics', () => getSummary(range));
      setWaited(Math.round(performance.now() - start));
      setData(d);
      setError('');
    } catch (err) {
      if (err.status === 401) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      setError(err.message);
    }
  }, [range, logout, navigate]);

  useEffect(() => {
    if (loadingUser || !(isAdmin || isLead)) return undefined;
    load();
    const t = setInterval(load, 30 * 1000);
    return () => clearInterval(t);
  }, [load, loadingUser, isAdmin, isLead]);

  if (loadingUser) return <main className="page"><p className="muted">Loading…</p></main>;
  if (!isAdmin && !isLead) {
    return (
      <main className="page">
        <h1>Performance</h1>
        <p className="lede">System uptime and speed are for team leads and administrators.</p>
      </main>
    );
  }

  const up = data?.uptime;
  const upOk = up?.percent != null && up.percent >= data.targets.uptimePercent;

  return (
    <main className="page page-wide perf">
      <div className="page-head">
        <div>
          <p className="eyebrow">Requirement change · uptime and speed</p>
          <h1>Performance</h1>
          <p className="lede">
            How often the system was unavailable, and how fast logging in, submitting an incident,
            resolving one and refreshing these numbers are, against our targets.
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Time window">
          {WINDOWS.map(([value, label]) => (
            <button key={value} type="button" className={range === value ? 'active' : ''} aria-pressed={range === value} onClick={() => setRange(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="flash flash-error" role="alert">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}

      {data && (
        <>
          <p className="muted perf-updated" aria-live="polite">
            Updated {formatDate(data.generatedAt)} · computed in {ms(data.computeMs)} on the server
            {waited != null && <>, {ms(waited)} for you</>} · refreshes every {data.targets.analyticsRefreshSeconds} seconds.
          </p>

          <section className="perf-cards">
            <div className="card perf-card">
              <p className="eyebrow">Right now</p>
              <p className="perf-big">
                <span className={`perf-dot ${data.health.status === 'ok' ? 'perf-dot-ok' : 'perf-dot-bad'}`} aria-hidden="true" />
                {data.health.status === 'ok' ? 'Up' : 'Degraded'}
              </p>
              <p className="muted">Database {data.health.database} · server running for {minutesText(data.health.uptimeSeconds / 60)}</p>
            </div>
            <div className="card perf-card">
              <p className="eyebrow">Uptime · target {data.targets.uptimePercent}%</p>
              <p className="perf-big">{up?.percent != null ? `${up.percent}%` : '—'}</p>
              <p className="muted">
                {up?.totalMinutes
                  ? <>Down {minutesText(up.downMinutes)} of {minutesText(up.totalMinutes)} measured</>
                  : 'Measuring starts with the first heartbeat'}
              </p>
              <Verdict ok={upOk} none={up?.percent == null} />
            </div>
            <div className="card perf-card">
              <p className="eyebrow">All requests</p>
              <p className="perf-big">{ms(data.overall.p95)}</p>
              <p className="muted">
                p95 of {data.overall.count.toLocaleString()} requests · average {ms(data.overall.avg)} · server errors {data.overall.errorRate ?? 0}%
              </p>
            </div>
          </section>

          <section className="admin-section" aria-labelledby="perf-speed">
            <div className="section-head"><h2 id="perf-speed">Speed</h2></div>
            <p className="muted">
              Server time is spent inside the backend; “what users waited” is the full round trip measured in the browser.
              p95 means 95% of requests were at least this fast.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Target (p95)</th>
                    <th>Server p50 / p95</th>
                    <th>What users waited p50 / p95</th>
                    <th>Samples</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.speed.map((s) => {
                    const none = !s.server.count && !s.client.count;
                    const ok = (!s.server.count || s.server.p95 <= s.target.server) && (!s.client.count || s.client.p95 <= s.target.client);
                    return (
                      <tr key={s.op}>
                        <th scope="row">{s.label}</th>
                        <td>{ms(s.target.server)} server<div className="muted">{ms(s.target.client)} for users</div></td>
                        <td>{ms(s.server.p50)} / <b>{ms(s.server.p95)}</b>{s.server.errors ? <div className="muted">{s.server.errors} server errors</div> : null}</td>
                        <td>{ms(s.client.p50)} / <b>{ms(s.client.p95)}</b></td>
                        <td>{s.server.count} server · {s.client.count} users</td>
                        <td><Verdict ok={ok} none={none} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-section" aria-labelledby="perf-incidents">
            <div className="section-head"><h2 id="perf-incidents">How fast incidents are handled</h2></div>
            <p className="muted">Incidents filed in this window, from submission to acknowledgement and to resolution.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Filed</th>
                    <th>Acknowledged: median (target)</th>
                    <th>Resolved: median (target)</th>
                    <th>Within target</th>
                    <th>Escalated / reached final</th>
                  </tr>
                </thead>
                <tbody>
                  {data.incidents.map((r) => {
                    const sev = SEVERITIES.find((s) => s.value === r.severity);
                    return (
                      <tr key={r.severity}>
                        <th scope="row"><span className={`severity severity-${r.severity}`}>{r.severity} · {sev?.label}</span></th>
                        <td>{r.filed}</td>
                        <td>{minutesText(r.acknowledgeMedian)} <span className="muted">({minutesText(r.target.acknowledge)})</span></td>
                        <td>{minutesText(r.resolveMedian)} <span className="muted">({minutesText(r.target.resolve)})</span></td>
                        <td>
                          {r.acknowledged ? `${r.acknowledgeWithinTarget}/${r.acknowledged} acknowledged` : '—'}
                          <div className="muted">{r.resolved ? `${r.resolveWithinTarget}/${r.resolved} resolved` : ''}</div>
                        </td>
                        <td>{r.escalated} / <span className={r.reachedFinal ? 'perf-final' : ''}>{r.reachedFinal}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-section" aria-labelledby="perf-downtime">
            <div className="section-head"><h2 id="perf-downtime">When the system was unavailable</h2></div>
            {up?.downtimes?.length ? (
              <ul className="perf-list">
                {up.downtimes.map((d) => (
                  <li key={d.from}>{formatDate(d.from)} to {formatDate(d.to)} <span className="muted">({minutesText(d.minutes)})</span></li>
                ))}
              </ul>
            ) : (
              <p className="muted">No outages in this window{up?.monitoredSince ? ` (measuring since ${formatDate(up.monitoredSince)})` : ''}.</p>
            )}
            {up?.restarts?.length > 0 && (
              <p className="muted">Server (re)started: {up.restarts.slice(0, 5).map((r) => formatDate(r)).join(' · ')}</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
