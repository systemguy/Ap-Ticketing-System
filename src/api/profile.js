import { apiFetch } from './client';

// Set to false once the backend routes in API_CONTRACT.md exist.
const USE_MOCK = true;

const me = { _id: 'u1', username: 'adriana', email: 'adriana@stedwards.edu', bio: 'CS student, cybersecurity concentration.' };
const maria = { _id: 'u2', username: 'maria' };
const incidents = [
  { _id: 'i1', title: 'Leaking pipe in unit 204', status: 'in_progress', severity: 'high', reportedBy: me, assignedTo: maria, createdAt: '2026-10-01T14:00:00Z' },
  { _id: 'i2', title: 'Broken hallway light, 3rd floor', status: 'open', severity: 'low', reportedBy: maria, assignedTo: me, createdAt: '2026-10-03T09:30:00Z' },
  { _id: 'i3', title: 'Gate keypad not responding', status: 'resolved', severity: 'medium', reportedBy: me, assignedTo: maria, createdAt: '2026-09-25T18:00:00Z', resolvedAt: '2026-09-27T12:00:00Z' },
];
const timeline = [
  { _id: 'e1', type: 'created', actor: me, createdAt: '2026-10-01T14:00:00Z' },
  { _id: 'e2', type: 'assignment_change', actor: me, from: null, to: maria, createdAt: '2026-10-01T14:05:00Z' },
  { _id: 'e3', type: 'status_change', actor: maria, from: 'open', to: 'in_progress', createdAt: '2026-10-02T10:00:00Z' },
  { _id: 'e4', type: 'comment', actor: maria, comment: 'Plumber scheduled for Friday morning.', createdAt: '2026-10-02T10:02:00Z' },
];
const delay = (data) => new Promise((r) => setTimeout(() => r(structuredClone(data)), 300));

export const getMe = () => (USE_MOCK ? delay(me) : apiFetch('/users/me'));

export const updateBio = (bio) =>
  USE_MOCK
    ? (me.bio = bio, delay(me))
    : apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify({ bio }) });

export const getMyIncidents = () => (USE_MOCK ? delay(incidents) : apiFetch('/users/me/incidents'));

export const getIncident = (id) =>
  USE_MOCK ? delay(incidents.find((i) => i._id === id) || incidents[0]) : apiFetch(`/incidents/${id}`);

export const getIncidentTimeline = (id) =>
  USE_MOCK ? delay(timeline) : apiFetch(`/incidents/${id}/timeline`);
