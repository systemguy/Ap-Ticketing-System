// Escalation policies: backend/app/controllers/escalationControllers.js. Teams are named, e.g. "HVAC".
import { apiFetch } from './client';

// Everything the page needs for one team:
// { team, canEdit, policy: { enabled, levels, updatedAt, updatedBy } | null, defaults, limits, candidates, tickets }
// Each level: { assignTo: 'on-call'|'lead'|'person', person, after: { low, moderate, high, critical }, now, nobody }
export const getPolicy = (team) => apiFetch(`/escalation/${encodeURIComponent(team)}`);

// Team lead or admin. A bad policy throws with every problem in err.list.
// levels: [{ assignTo, person?, after: { low, moderate, high, critical } }] (minutes)
// finalAfter: { low, moderate, high, critical }: how long the last level gets before the final step
export const savePolicy = (team, { enabled, levels, finalAfter }) =>
  apiFetch(`/escalation/${encodeURIComponent(team)}`, { method: 'PUT', body: JSON.stringify({ enabled, levels, finalAfter }) });

// A lead of both teams: `source`'s policy rewritten for `team`, to load into the form (nothing is saved).
// { source, enabled, levels, finalAfter, dropped: ['Level 2 (Bob) was left out: ...'] }
export const copyPolicyFrom = (team, source) =>
  apiFetch(`/escalation/${encodeURIComponent(team)}/copy-from/${encodeURIComponent(source)}`);
