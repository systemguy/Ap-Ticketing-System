import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { listShifts, listStaff } from '../../api/schedule';
import { departments } from '../../data/services';
import { SHIFTS, addDays, formatDay, todayKey, weekDays, weekStart } from '../../data/shifts';

// Week calendar: one row per shift, one column per day, employees placed in each cell.
export default function AdminCalendarPage() {
  const [anchor, setAnchor] = useState(weekStart(todayKey())); // Monday of the shown week
  const [staff, setStaff] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [dept, setDept] = useState('all');
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const today = todayKey();

  useEffect(() => {
    listStaff().then(setStaff);
  }, []);

  useEffect(() => {
    listShifts(days[0], days[6]).then(setShifts);
  }, [days]);

  const person = (id) => staff.find((s) => s._id === id);
  const inDept = (s) => dept === 'all' || person(s.employeeId)?.department === dept;
  const cell = (day, shiftId) => shifts.filter((s) => s.date === day && s.shift === shiftId && inDept(s));

  const rangeLabel = `${formatDay(days[0], { month: 'short', day: 'numeric' })} – ${formatDay(days[6], { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <AdminLayout title="Shift calendar" intro="Who is working each shift this week.">
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button type="button" className="btn btn-outline btn-small" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Previous week">←</button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => setAnchor(weekStart(today))}>This week</button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Next week">→</button>
          <span className="calendar-range">{rangeLabel}</span>
        </div>
        <div className="calendar-filter">
          <label htmlFor="cal-dept">Department</label>
          <select id="cal-dept" className="select-compact" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <Link to="/admin/schedule" className="btn btn-small">Add shifts</Link>
        </div>
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
            {SHIFTS.map((sh) => (
              <tr key={sh.id}>
                <th scope="row" className="calendar-shift">
                  <span className={`shift-chip shift-${sh.id}`}>{sh.label}</span>
                  <span className="muted">{sh.hours}</span>
                </th>
                {days.map((d) => {
                  const people = cell(d, sh.id);
                  // A department with nobody on call that day is flagged
                  const gap = sh.id === 'oncall' && dept !== 'all' && people.length === 0;
                  return (
                    <td key={d} className={`${d === today ? 'is-today' : ''} ${gap ? 'is-gap' : ''}`}>
                      {people.map((s) => {
                        const p = person(s.employeeId);
                        return (
                          <span key={s._id} className={`person dept-${(p?.department || 'none').toLowerCase()}`} title={p?.department}>
                            {p?.name || 'Unknown'}
                          </span>
                        );
                      })}
                      {gap && <span className="gap-label">No on-call</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="legend" aria-label="Department colors">
        {departments.map((d) => (
          <li key={d}><span className={`person dept-${d.toLowerCase()}`}>{d}</span></li>
        ))}
      </ul>
    </AdminLayout>
  );
}
