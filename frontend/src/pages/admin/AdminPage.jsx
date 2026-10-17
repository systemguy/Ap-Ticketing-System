import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { listShifts, listStaff } from '../../api/schedule';
import { departments } from '../../data/services';
import { formatDay, todayKey, weekDays } from '../../data/shifts';

// Admin overview: this week's numbers and the days with no on-call coverage.
export default function AdminPage() {
  const [staff, setStaff] = useState([]);
  const [shifts, setShifts] = useState([]);
  const days = weekDays(todayKey());

  useEffect(() => {
    Promise.all([listStaff(), listShifts(days[0], days[6])]).then(([s, sh]) => {
      setStaff(s);
      setShifts(sh);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deptOf = (employeeId) => staff.find((s) => s._id === employeeId)?.department;

  // For each department, the days this week nobody is on call
  const gaps = departments
    .map((dept) => ({
      dept,
      days: days.filter((day) => !shifts.some((s) => s.date === day && s.shift === 'oncall' && deptOf(s.employeeId) === dept)),
    }))
    .filter((g) => g.days.length > 0);

  const scheduledPeople = new Set(shifts.map((s) => s.employeeId)).size;

  return (
    <AdminLayout title="Overview" intro="Staffing at a glance for the current week.">
      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{shifts.length}</span>
          <span className="stat-label">Shifts this week</span>
        </div>
        <div className="stat">
          <span className="stat-value">{scheduledPeople}/{staff.length}</span>
          <span className="stat-label">Staff scheduled</span>
        </div>
        <div className="stat">
          <span className="stat-value">{gaps.reduce((n, g) => n + g.days.length, 0)}</span>
          <span className="stat-label">On-call gaps</span>
        </div>
      </div>

      <div className="admin-grid">
        <section className="card">
          <h3 className="card-title">On-call coverage this week</h3>
          {gaps.length === 0 ? (
            <p className="muted">Every department has someone on call every day this week.</p>
          ) : (
            <ul className="gap-list">
              {gaps.map((g) => (
                <li key={g.dept}>
                  <strong>{g.dept}</strong>
                  <span className="muted">
                    {g.days.length === 7 ? 'No on-call all week' : g.days.map((d) => formatDay(d, { weekday: 'short' })).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/admin/schedule" className="btn btn-small">Schedule shifts</Link>
        </section>

        <section className="card">
          <h3 className="card-title">Shift calendar</h3>
          <p className="muted">See who is working each day, by shift, and filter by department.</p>
          <Link to="/admin/calendar" className="btn btn-outline btn-small">Open calendar</Link>
        </section>
      </div>
    </AdminLayout>
  );
}
