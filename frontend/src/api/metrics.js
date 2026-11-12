// Uptime and speed numbers (requirement change)
import { apiFetch } from './client';

// For the Performance page (admins and team leads)
export const getSummary = (window = '24h') => apiFetch(`/metrics/summary?window=${encodeURIComponent(window)}`);

// Sends how long the user waited (login, submit, resolve or analytics). Errors are ignored.
export function reportTiming(op, ms) {
  apiFetch('/metrics/client', { method: 'POST', body: JSON.stringify({ op, ms: Math.round(ms) }) }).catch(() => {});
}

// Runs fn and reports how long it took
export async function timed(op, fn) {
  const start = performance.now();
  const result = await fn();
  reportTiming(op, performance.now() - start);
  return result;
}
