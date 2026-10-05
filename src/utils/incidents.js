// Statuses that count as "closed/resolved". Match these to your schema.
export const CLOSED_STATUSES = ['resolved', 'closed'];

// Handles both raw ObjectId strings and populated objects ({ _id, username }).
export const idOf = (v) => (v && typeof v === 'object' ? v._id : v);

export const nameOf = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v.username || v.email || 'Unknown user';
  return v;
};

export const isClosed = (incident) =>
  CLOSED_STATUSES.includes(String(incident.status || '').toLowerCase());

const time = (d) => (d ? new Date(d).getTime() : 0);

// Newest first. Flip the subtraction for oldest first.
const newestBy = (getDate) => (a, b) => time(getDate(b)) - time(getDate(a));

export function splitIncidents(incidents, userId) {
  const uid = String(userId);
  const filedByMe = (i) => String(idOf(i.reportedBy)) === uid;
  const assignedToMe = (i) => String(idOf(i.assignedTo)) === uid;
  const involvesMe = (i) => filedByMe(i) || assignedToMe(i);

  const active = incidents
    .filter((i) => !isClosed(i) && involvesMe(i))
    .sort(newestBy((i) => i.createdAt));

  const closed = incidents
    .filter((i) => isClosed(i) && involvesMe(i))
    .sort(newestBy((i) => i.resolvedAt || i.closedAt || i.updatedAt || i.createdAt));

  const filed = incidents
    .filter(filedByMe)
    .sort(newestBy((i) => i.createdAt));

  return { active, closed, filed };
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
