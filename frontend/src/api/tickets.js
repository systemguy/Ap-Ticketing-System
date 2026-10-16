import { apiFetch } from './client';

// Tickets the user filed plus every ticket for their team's services
export const listTickets = () =>
  apiFetch('/tickets').then((data) => (Array.isArray(data) ? data : data?.tickets || []));

// payload: { title, description, unit, service, severity, type, photo? }
export const createTicket = (payload) =>
  apiFetch('/tickets/create', { method: 'POST', body: JSON.stringify(payload) }).then((data) => data?.ticket);

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

// Saved as a comment for the reporter, or a note for the ticket's team
export const addComment = (id, text) =>
  apiFetch(`/tickets/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) });
