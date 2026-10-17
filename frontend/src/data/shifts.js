// Shift types offered in the admin scheduling dropdowns and shown on the calendar.
export const SHIFTS = [
  { id: 'morning', label: 'Morning', hours: '7:00 AM – 3:00 PM' },
  { id: 'evening', label: 'Evening', hours: '3:00 PM – 11:00 PM' },
  { id: 'overnight', label: 'Overnight', hours: '11:00 PM – 7:00 AM' },
  { id: 'oncall', label: 'On-call', hours: '24 hours, responds to escalations' },
];

export const shiftOf = (id) => SHIFTS.find((s) => s.id === id);

// How a new shift repeats when it's created
export const REPEAT_OPTIONS = [
  { id: 'once', label: 'Just this day', dates: (start) => [start] },
  { id: 'weekdays', label: 'Every weekday that week (Mon–Fri)', dates: (start) => weekdaysOf(start) },
  { id: 'weekly4', label: 'Same day for 4 weeks', dates: (start) => [0, 7, 14, 21].map((d) => addDays(start, d)) },
];

// ---- Date helpers. Dates are 'YYYY-MM-DD' strings in local time. ----

export function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, days) {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return toKey(date);
}

// Monday of the week containing `key`
export function weekStart(key) {
  const date = fromKey(key);
  const offset = (date.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  date.setDate(date.getDate() - offset);
  return toKey(date);
}

export function weekDays(key) {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function weekdaysOf(key) {
  return weekDays(key).slice(0, 5);
}

export const todayKey = () => toKey(new Date());

export function formatDay(key, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return fromKey(key).toLocaleDateString(undefined, opts);
}
