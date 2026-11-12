// Escalation policies: backend/app/controllers/escalationControllers.js. Teams are named, e.g. "HVAC".
import { apiFetch } from './client';

// Everything the page needs for one team:
// { team, canEdit, policy: { enabled, levels, updatedAt, updatedBy } | null, defaults, limits, candidates, tickets }
// Each level: { assignTo: 'on-call'|'lead'|'person', person, after: { low, moderate, high, critical }, now, nobody }
export const getPolicy = (team) => apiFetch(`/teams/escalation/${encodeURIComponent(team)}`);

// Team lead or admin. A bad policy throws with every problem in err.list.
// levels: [{ assignTo, person?, after: { low, moderate, high, critical } }] (minutes)
export const savePolicy = (team, payload) =>
  apiFetch(`/teams/escalation/${encodeURIComponent(team)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });