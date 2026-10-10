import { apiFetch } from './client';

// Profile routes on the backend (app/controllers/userControllers.js)
export const getMe = () => apiFetch('/users/me');

export const updateBio = (bio) =>
  apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify({ bio }) });

// Tickets the user filed or is assigned to
export const getMyIncidents = () => apiFetch('/users/me/tickets').then((data) => data.tickets);
