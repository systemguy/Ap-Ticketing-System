// Statuses that count as "closed/resolved". Match these to your schema.
export const CLOSED_STATUSES = ['resolved', 'closed'];

// Handles both raw ObjectId strings and populated objects ({ _id, name }).
export const idOf = (v) => (v && typeof v === 'object' ? v._id : v);

export const nameOf = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v.name || v.email || 'Unknown user';
  return v;
};

export const isClosed = (incident) =>
  CLOSED_STATUSES.includes(String(incident.status || '').toLowerCase());

const time = (d) => (d ? new Date(d).getTime() : 0);

// Newest first. Flip the subtraction for oldest first.
const newestBy = (getDate) => (a, b) => time(getDate(b)) - time(getDate(a));

// When a closed/resolved ticket was finished. The Closed column sorts AND displays
// by this date, so the dates on screen always read in order.
// Uses the date for the CURRENT status, so a reopened-then-resolved ticket
// doesn't show the date it was closed the first time.
export function finishedAt(i) {
  const status = String(i.status || '').toLowerCase();
  if (status === 'closed') return i.closedAt || i.resolvedAt || i.updatedAt || i.createdAt;
  return i.resolvedAt || i.closedAt || i.updatedAt || i.createdAt;
}

export const isFiledBy = (i, userId) => Boolean(userId) && String(idOf(i.userPosted)) === String(userId);
export const isAssignedTo = (i, userId) => Boolean(userId) && String(idOf(i.assignedTo)) === String(userId);

// Every incident lands in exactly one column, so nothing is listed twice.
// Each card is tagged "Filed by you" / "Assigned to you" instead of a third column.
export function splitIncidents(incidents, userId) {
  const involvesMe = (i) => isFiledBy(i, userId) || isAssignedTo(i, userId);
  const mine = incidents.filter(involvesMe);

  const active = mine.filter((i) => !isClosed(i)).sort(newestBy((i) => i.createdAt));
  const closed = mine.filter(isClosed).sort(newestBy(finishedAt));

  return { active, closed };
}

export function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatStatus(s) {
  if (!s) return 'Unknown';
  const text = String(s).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
