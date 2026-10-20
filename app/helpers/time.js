// Central-time helpers for the on-call schedule. Shift boundaries (7 AM, 3 PM, 11 PM)
// are Austin time, so these convert between Central dates and real moments, including
// across daylight-saving changes.
const TZ = 'America/Chicago'

const partsFormatter = new Intl.DateTimeFormat('en-US', {
	timeZone: TZ, hourCycle: 'h23',
	year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})
const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })

// Central calendar fields for a moment
function centralParts(at) {
	const p = Object.fromEntries(partsFormatter.formatToParts(at).map((x) => [x.type, Number(x.value)]))
	return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second }
}

// How far Central time is from UTC at that moment, in minutes (-300 in summer, -360 in winter)
function offsetMinutes(at) {
	const p = centralParts(at)
	const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
	return (wall - Math.floor(at.getTime() / 1000) * 1000) / 60000
}

// The real moment for a Central date ('YYYY-MM-DD') at an hour, e.g. 7 AM on Oct 21
function centralMoment(date, hour, minute = 0) {
	const [y, m, d] = date.split('-').map(Number)
	const wall = Date.UTC(y, m - 1, d, hour, minute)
	const first = new Date(wall - offsetMinutes(new Date(wall)) * 60000)
	return new Date(wall - offsetMinutes(first) * 60000) // second pass settles daylight-saving edges
}

// 'YYYY-MM-DD' of the Central day a moment falls on
function centralDate(at) {
	const p = centralParts(at)
	return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

function addDays(date, days) {
	const [y, m, d] = date.split('-').map(Number)
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// Whole days since 1970 for a date, used to alternate rotations day by day
function dayNumber(date) {
	const [y, m, d] = date.split('-').map(Number)
	return Date.UTC(y, m - 1, d) / 86400000
}

// A real calendar date written as YYYY-MM-DD
const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s

// "Wednesday, Oct 21" and "3:00 PM", for messages people read
const formatDay = (at) => dayFormatter.format(at)
const formatTime = (at) => timeFormatter.format(at).replace(/\u202f/g, ' ')

// "on Wednesday, Oct 21 from 3:00 PM to 11:00 PM", naming both days when it crosses midnight
function formatRange(start, end) {
	if (centralDate(start) === centralDate(end)) {
		return `on ${formatDay(start)} from ${formatTime(start)} to ${formatTime(end)}`
	}
	return `from ${formatDay(start)}, ${formatTime(start)} to ${formatDay(end)}, ${formatTime(end)}`
}

module.exports = { TZ, centralMoment, centralDate, addDays, dayNumber, isDateKey, formatDay, formatTime, formatRange }