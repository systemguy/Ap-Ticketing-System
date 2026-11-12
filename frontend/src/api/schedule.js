// On-call schedule: the backend's /shifts, /teams and /users routes
// (backend/app/controllers/shiftControllers.js). Teams are named, e.g. "HVAC".
import { apiFetch } from './client';

const qs = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();

// Shifts for one team between two Central dates ('YYYY-MM-DD', inclusive).
// Each shift: { _id, team: { _id, name }, date, shift: 'morning'|'evening'|'overnight',
//               employeeId, responder: { _id, name }, start, end }
export const listShifts = ({ team, from, to }) =>
  apiFetch(`/shifts?${qs({ team, from, to })}`).then((d) => d?.shifts || []);

// Who is on call for a team right now: { responder: {_id, name} | null, reason, shift }
export const getOnCall = (team) => apiFetch(`/shifts/on-call?${qs({ team })}`);

// Every team and its lead: [{ _id, name, lead: { _id, name } | null }]
export const listTeams = () => apiFetch('/teams').then((d) => d?.teams || []);

// Staff the logged-in user can schedule or see: [{ _id, name, department, departments: [team names] }]
export const listStaff = () => apiFetch('/users?role=staff').then((d) => d?.staff || []);

// Team leads only. All or nothing: a bad schedule throws with every problem in err.message.
// shifts: [{ team, employeeId, date, shift }]  ->  { added: [...], skipped: [...] }
export const addShifts = (shifts) =>
  apiFetch('/shifts', { method: 'POST', body: JSON.stringify({ shifts }) });

// Team leads only: change who covers a shift
export const changeShift = (id, employeeId) =>
  apiFetch(`/shifts/${id}`, { method: 'PATCH', body: JSON.stringify({ employeeId }) });

// Team leads only: refused if it would leave the team without coverage
export const removeShift = (id) => apiFetch(`/shifts/${id}`, { method: 'DELETE' });
