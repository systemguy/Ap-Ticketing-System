// The three on-call shifts that cover each day, in Central time (matches SLOTS in
// backend/app/helpers/shifts.js). Overnight starts on the date shown and ends the next morning.
export const SLOTS = [
  { id: 'morning', label: 'Morning', hours: '7 AM – 3 PM' },
  { id: 'evening', label: 'Evening', hours: '3 PM – 11 PM' },
  { id: 'overnight', label: 'Overnight', hours: '11 PM – 7 AM' },
];

export const slotOf = (id) => SLOTS.find((s) => s.id === id);

// How a new shift repeats when a team lead creates it
export const REPEAT_OPTIONS = [
  { id: 'once', label: 'Just this day', dates: (start) => [start] },
  { id: 'week', label: 'Every day for 7 days', dates: (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i)) },
  { id: 'weekly4', label: 'Same day for 4 weeks', dates: (start) => [0, 7, 14, 21].map((d) => addDays(start, d)) },
];

// ---- Dates are 'YYYY-MM-DD' strings for the Central day (the building is in Austin) ----

const TZ = 'America/Chicago';

// Today's date in Central time, whatever the viewer's computer is set to
export function todayKey(at = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(at)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}`;
}

// The current hour (0–23) in Central time
export const centralHour = (at = new Date()) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(at));

// Calendar arithmetic on date keys (done in UTC so daylight saving never shifts a day)
export function addDays(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Monday of the week containing `key`
export function weekStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

export const weekDays = (key) => Array.from({ length: 7 }, (_, i) => addDays(weekStart(key), i));

export function formatDay(key, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

// "3:00 PM", "Fri 7:00 AM" (withDay) or "Fri, Oct 30, 7:00 AM" (withDay = 'date'), in Central time
export function formatTime(at, withDay = false) {
  return new Date(at).toLocaleString('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    ...(withDay ? { weekday: 'short' } : {}),
    ...(withDay === 'date' ? { month: 'short', day: 'numeric' } : {}),
  });
}
