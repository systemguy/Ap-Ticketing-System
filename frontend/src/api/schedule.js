// Scheduling data for the admin pages.
//
// TEMPORARY STORAGE: there is no scheduling API on the backend yet (Sprint 3 work),
// so shifts are kept in this browser's localStorage. Every function is async and
// shaped like the endpoints we expect to build, so swapping to the real API means
// changing only this file, e.g.
//
//   listShifts(from, to)  -> GET    /shifts?from=YYYY-MM-DD&to=YYYY-MM-DD
//   addShifts(list)       -> POST   /shifts          body: { shifts: [...] }
//   removeShift(id)       -> DELETE /shifts/:id
//   listStaff()           -> GET    /users?role=staff
//
// Shift shape: { _id, employeeId, date: 'YYYY-MM-DD', shift: 'morning' | 'evening' | 'overnight' | 'oncall' }
import { DEMO_STAFF } from '../data/demoStaff';

const STORAGE_KEY = 'ap-demo-shifts-v1';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    throw new Error('Could not save the schedule in this browser.');
  }
}

const newId = () => `shift-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function listStaff() {
  return DEMO_STAFF;
}

// Shifts between two dates, inclusive. Omit both for everything.
export async function listShifts(from, to) {
  return readAll()
    .filter((s) => (!from || s.date >= from) && (!to || s.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Adds shifts, skipping exact duplicates (same person, day and shift).
// Returns { added, skipped } so the page can say what happened.
export async function addShifts(shifts) {
  const all = readAll();
  const exists = (s) => all.some((x) => x.employeeId === s.employeeId && x.date === s.date && x.shift === s.shift);
  const added = [];
  const skipped = [];
  for (const s of shifts) {
    if (exists(s)) {
      skipped.push(s);
    } else {
      const saved = { ...s, _id: newId() };
      all.push(saved);
      added.push(saved);
    }
  }
  writeAll(all);
  return { added, skipped };
}

export async function removeShift(id) {
  writeAll(readAll().filter((s) => s._id !== id));
}
