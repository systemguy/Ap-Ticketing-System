import { apiFetch } from './client';

// Tickets the user filed plus every ticket for their team's services.
// Admins and auditors get every ticket (auditors also get deleted ones, with active: false).
// filters (all optional, combined with AND), e.g. { severity: [3, 4], team: ['HVAC'],
// excludeService: ['network setup'], from: '2026-11-01', to: '2026-11-30' }.
// Lists are sent comma-separated; empty values are left out.
export function listTickets(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    const text = Array.isArray(value) ? value.join(',') : value;
    if (text !== undefined && text !== null && String(text) !== '') params.set(key, String(text));
  }
  const query = params.toString();
  return apiFetch(`/tickets${query ? `?${query}` : ''}`)
    .then((data) => (Array.isArray(data) ? data : data?.tickets || []));
}

// payload: { title, description, unit, service, severity, type, photo? }
// Returns { ticket, assignment }. assignment.to is who got it, or null with a reason.
export const createTicket = (payload) =>
  apiFetch('/tickets/create', { method: 'POST', body: JSON.stringify(payload) })
    .then((data) => ({ ticket: data?.ticket, assignment: data?.assignment ?? null }));

// Reporter only
export const editTicket = (id, payload) =>
  apiFetch(`/tickets/edit/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

// Reporter only
export const deleteTicket = (id) => apiFetch(`/tickets/delete/${id}`, { method: 'PUT' });

// One ticket and its timeline: { ticket, role: 'reporter' | 'solver', nextStatuses }
export const getTicket = (id) => apiFetch(`/tickets/${id}`);

// Solvers only. A rejected move throws an error whose message is the backend's reason.
export const changeStatus = (id, status) =>
  apiFetch(`/tickets/update/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });

// Team lead of the ticket's team (or an admin): give an active ticket to whoever is on call now.
// The backend refuses anyone else and records the change on the timeline.
export const reassignTicket = (id, responderId) =>
  apiFetch(`/tickets/${id}/assign`, { method: 'PUT', body: JSON.stringify({ responderId }) });

// Saved as a comment for the reporter, or a note for the ticket's team
export const addComment = (id, text) =>
  apiFetch(`/tickets/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) });
