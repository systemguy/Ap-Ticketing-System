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

// Accounts. Deleting is a soft delete and is refused (409, with a `problems` list) while the
// person still has shifts, leads a team, is named in an escalation level or has open incidents.
export const setAccountTeam = (userId, team) =>
  apiFetch(`/admin/users/${userId}/team`, { method: 'PATCH', body: JSON.stringify({ team }) });
// role: 'admin' | 'auditor' | 'standard'
export const setAccountRole = (userId, role) =>
  apiFetch(`/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });

// Teams
export const createTeam = (name) => apiFetch('/admin/teams', { method: 'POST', body: JSON.stringify({ name }) });
export const deleteTeam = (teamId) => apiFetch(`/admin/teams/${teamId}`, { method: 'DELETE' });
export const restoreTeam = (teamId) => apiFetch(`/admin/teams/${teamId}/restore`, { method: 'POST' });

// Services: [{ _id, name, team: { name, active } | null, openIncidents, active, deletedAt?, deletedBy? }]
export const listServices = () => apiFetch('/admin/services').then((d) => d?.services || []);
export const createService = (name, team) =>
  apiFetch('/admin/services', { method: 'POST', body: JSON.stringify({ name, team: team || undefined }) });
export const moveService = (serviceId, team) =>
  apiFetch(`/admin/services/${serviceId}`, { method: 'PATCH', body: JSON.stringify({ team: team || null }) });
export const deleteService = (serviceId) => apiFetch(`/admin/services/${serviceId}`, { method: 'DELETE' });
export const restoreService = (serviceId) => apiFetch(`/admin/services/${serviceId}/restore`, { method: 'POST' });
