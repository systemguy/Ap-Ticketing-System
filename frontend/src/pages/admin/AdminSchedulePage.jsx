import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from './AdminLayout';
import { addShifts, listShifts, listStaff, removeShift } from '../../api/schedule';
import { departments } from '../../data/services';
import { REPEAT_OPTIONS, SHIFTS, formatDay, shiftOf, todayKey } from '../../data/shifts';

// Assign employees to shifts with dropdowns, and see/remove upcoming shifts.
export default function AdminSchedulePage() {
  const [staff, setStaff] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [department, setDepartment] = useState(departments[0]);
  const [employeeId, setEmployeeId] = useState('');
  const [shift, setShift] = useState(SHIFTS[0].id);
  const [date, setDate] = useState(todayKey());
  const [repeat, setRepeat] = useState(REPEAT_OPTIONS[0].id);
  const [listFilter, setListFilter] = useState('all');
  const [notice, setNotice] = useState(null); // { ok, text }

  const reload = useCallback(() => listShifts(todayKey()).then(setShifts), []);

  useEffect(() => {
    listStaff().then(setStaff);
    reload();
  }, [reload]);

  const teamStaff = useMemo(() => staff.filter((s) => s.department === department), [staff, department]);

  // Keep the employee dropdown valid when the department changes
  useEffect(() => {
    if (!teamStaff.some((s) => s._id === employeeId)) setEmployeeId(teamStaff[0]?._id || '');
  }, [teamStaff, employeeId]);

  const person = (id) => staff.find((s) => s._id === id);

  async function submit(e) {
    e.preventDefault();
    if (!employeeId || !date) return;
    const dates = REPEAT_OPTIONS.find((r) => r.id === repeat).dates(date);
    try {
      const { added, skipped } = await addShifts(dates.map((d) => ({ employeeId, date: d, shift })));
      const who = person(employeeId)?.name || 'Employee';
      let text = `${who}: ${added.length} ${shiftOf(shift).label.toLowerCase()} shift${added.length === 1 ? '' : 's'} added.`;
      if (skipped.length) text += ` ${skipped.length} already on the schedule and skipped.`;
      setNotice({ ok: added.length > 0, text });
      reload();
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    }
  }

  async function remove(s) {
    await removeShift(s._id);
    setNotice({ ok: true, text: `Removed ${person(s.employeeId)?.name || 'shift'} on ${formatDay(s.date)}.` });
    reload();
  }

  const visible = shifts.filter((s) => listFilter === 'all' || person(s.employeeId)?.department === listFilter);

  return (
    <AdminLayout title="Scheduling" intro="Assign staff to shifts. On-call staff respond to escalated tickets.">
      <div className="admin-grid admin-grid-wide">
        <section className="card">
          <h3 className="card-title">Add a shift</h3>
          <form onSubmit={submit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="sch-dept">Department</label>
                <select id="sch-dept" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="sch-employee">Employee</label>
                <select id="sch-employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                  {teamStaff.length === 0 && <option value="">No staff in this department</option>}
                  {teamStaff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="sch-shift">Shift</label>
              <select id="sch-shift" value={shift} onChange={(e) => setShift(e.target.value)}>
                {SHIFTS.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.hours})</option>)}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="sch-date">Date</label>
                <input id="sch-date" type="date" value={date} min={todayKey()} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="sch-repeat">Repeat</label>
                <select id="sch-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
                  {REPEAT_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
            </div>

            <button type="submit" className="btn" disabled={!employeeId}>Add to schedule</button>
          </form>
          {notice && (
            <p className={`flash ${notice.ok ? 'flash-ok' : 'flash-error'}`} role="status">{notice.text}</p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3 className="card-title">Upcoming shifts</h3>
            <select className="select-compact" value={listFilter} onChange={(e) => setListFilter(e.target.value)} aria-label="Filter by department">
              <option value="all">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {visible.length === 0 ? (
            <p className="muted">No upcoming shifts{listFilter === 'all' ? '' : ` for ${listFilter}`}.</p>
          ) : (
            <ul className="shift-list">
              {visible.map((s) => {
                const p = person(s.employeeId);
                const def = shiftOf(s.shift);
                return (
                  <li key={s._id}>
                    <div>
                      <strong>{formatDay(s.date)}</strong>
                      <span className={`shift-chip shift-${s.shift}`}>{def?.label}</span>
                    </div>
                    <div className="muted">{p ? `${p.name} · ${p.department}` : 'Unknown employee'} · {def?.hours}</div>
                    <button type="button" className="link-button" onClick={() => remove(s)}>Remove</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
