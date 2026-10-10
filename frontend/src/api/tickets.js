import { apiFetch } from './client';

// One ticket and its timeline: { ticket, role: 'reporter' | 'solver', nextStatuses }
export const getTicket = (id) => apiFetch(`/tickets/${id}`);

// Solvers only. A rejected move throws an error whose message is the backend's reason.
export const changeStatus = (id, status) =>
  apiFetch(`/tickets/update/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });

// Saved as a comment for the reporter, or a note for the ticket's team
export const addComment = (id, text) =>
  apiFetch(`/tickets/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) });
