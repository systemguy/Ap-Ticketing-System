// Requirement change (Sprint 4): uptime and speed. backend/app/controllers/metricsControllers.js
import { apiFetch } from './client';

// Admins and team leads: uptime, speed against targets, and incident handling times
export const getSummary = (window = '24h') => apiFetch(`/metrics/summary?window=${encodeURIComponent(window)}`);

// Tells the backend how long the user waited for one of the measured operations
// (login, submit, resolve, analytics). Fire-and-forget: a failed report never bothers the user.
export function reportTiming(op, ms) {
  apiFetch('/metrics/client', { method: 'POST', body: JSON.stringify({ op, ms: Math.round(ms) }) }).catch(() => {});
}

// Runs fn, and if it succeeds, reports how long it took as `op`. Returns fn's result.
export async function timed(op, fn) {
  const start = performance.now();
  const result = await fn();
  reportTiming(op, performance.now() - start);
  return result;
}
