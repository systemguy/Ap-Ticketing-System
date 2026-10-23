// Admin portal: backend/app/controllers/adminControllers.js. Every route needs role "admin".
import { apiFetch } from './client';

// { teams: [...], unownedServices: [...], counts: {...} }
export const getOverview = () => apiFetch('/admin/overview');

// [{ _id, name, email, role, team, active, leads: [team names] }]
export const listAccounts = () => apiFetch('/admin/users').then((d) => d?.users || []);

export const setTeamLead = (teamId, leadId) =>
  apiFetch(`/admin/teams/${teamId}/lead`, { method: 'PATCH', body: JSON.stringify({ lead: leadId }) });

// Soft delete: a deactivated account can't log in and is never treated as on call
export const setAccountActive = (userId, active) =>
  apiFetch(`/admin/users/${userId}/active`, { method: 'PATCH', body: JSON.stringify({ active }) });
