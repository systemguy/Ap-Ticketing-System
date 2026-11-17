// On-call schedule rules: the three daily shifts, schedule validation, who can be put on a
// shift, who can change a team's schedule, and who is on call (used for auto-assignment).
const Shift = require('../models/shift')
const Team = require('../models/team')
const Ticket = require('../models/tickets')

// The most open incidents (Open, Acknowledged, Investigating) one on-call solver gets at a time
const MAX_ACTIVE = 3
const ACTIVE = ['Open', 'Acknowledged', 'Investigating']
const { centralMoment, addDays, formatRange } = require('./time')

// The three shifts that cover each day, in Central time. Overnight ends the next morning.
const SLOTS = {
	morning: { label: 'Morning', start: 7, end: 15 },
	evening: { label: 'Evening', start: 15, end: 23 },
	overnight: { label: 'Overnight', start: 23, end: 7 },
}

// Real start and end of a slot on a Central date
function slotTimes(date, slot) {
	const { start, end } = SLOTS[slot]
	return {
		start: centralMoment(date, start),
		end: centralMoment(end > start ? date : addDays(date, 1), end),
	}
}

// Gaps and double-booked time in one team's schedule, from `now` to the end of its last
// shift. Shifts may touch (one ends exactly when the next starts).
// shifts: [{ start, end, responderName }]
function teamProblems(teamName, shifts, now) {
	const upcoming = shifts.filter((s) => s.end > now).sort((a, b) => a.start - b.start)
	const problems = []
	let coveredUntil = now
	let latest = null // the shift that reaches coveredUntil
	for (const s of upcoming) {
		if (s.start > coveredUntil) {
			problems.push(`${teamName} is missing coverage ${formatRange(coveredUntil, s.start)}`)
		} else if (latest && s.start < coveredUntil) {
			const until = s.end < coveredUntil ? s.end : coveredUntil
			problems.push(`${teamName} is double-booked ${formatRange(s.start, until)} (${latest.responderName} and ${s.responderName})`)
		}
		if (s.end > coveredUntil) {
			coveredUntil = s.end
			latest = s
		}
	}
	return problems
}

// Each shift puts two people on call: the primary and (if set) the secondary.
// shift: { team, teamName, responder, responderName, secondary, secondaryName, start, end }
function dutiesOf(shift) {
	const duties = [{ ...shift, person: shift.responder, personName: shift.responderName, role: 'primary' }]
	if (shift.secondary) duties.push({ ...shift, person: shift.secondary, personName: shift.secondaryName, role: 'secondary' })
	return duties
}

// Rules for people across the whole schedule:
//   - nobody is primary and secondary on the same shift
//   - nobody is on call for two teams at once
//   - nobody is primary on back-to-back shifts (one ends when the next begins)
// shifts: forCheck() objects
function responderProblems(shifts, now) {
	const byPerson = new Map()
	for (const s of shifts) {
		if (s.end <= now) continue
		for (const d of dutiesOf(s)) {
			const key = String(d.person)
			if (!byPerson.has(key)) byPerson.set(key, [])
			byPerson.get(key).push(d)
		}
	}
	const problems = []
	for (const list of byPerson.values()) {
		list.sort((a, b) => a.start - b.start || (a.role === 'primary' ? -1 : 1))
		let prev = null
		let lastPrimary = null
		for (const d of list) {
			if (prev && d.start < prev.end) {
				if (String(d.team) === String(prev.team)) {
					problems.push(`${d.personName} can't be both primary and secondary on ${d.teamName}'s shift ${formatRange(d.start, d.end)}`)
				} else {
					const until = d.end < prev.end ? d.end : prev.end
					problems.push(`${d.personName} can't be on call for ${prev.teamName} and ${d.teamName} at the same time, ${formatRange(d.start, until)}`)
				}
			}
			if (d.role === 'primary') {
				if (lastPrimary && +lastPrimary.end === +d.start) {
					problems.push(`${d.personName} can't be primary on back-to-back shifts (${formatRange(lastPrimary.start, lastPrimary.end)} and ${formatRange(d.start, d.end)}). Give one of them to someone else`)
				}
				lastPrimary = d
			}
			if (!prev || d.end > prev.end) prev = d
		}
	}
	return [...new Set(problems)]
}

// Why someone can't go on a team's shifts, or null if they can. They must be active staff
// whose home team it is (user.team holds the team's name), or the team's lead. Reporters never can.
// The team lead's id as a string ('' if there's no lead)
const leadId = (team) => String(team?.lead?._id ?? team?.lead ?? '')

function ineligibleReason(user, team) {
	if (!user) return 'That person no longer has an account'
	if (user.active === false) return `${user.name}'s account is deactivated`
	if ((leadId(team) && leadId(team) === String(user._id)) || user.team === team.name) return null
	if (!user.team || user.team === 'user') return `${user.name} is a reporter and can't be put on a shift`
	return `${user.name} isn't on ${team.name} and doesn't lead it`
}

// Only a team's lead changes its schedule. A future admin role is allowed too.
const canManage = (user, team) => user?.role === 'admin' || (Boolean(leadId(team)) && leadId(team) === String(user?._id))

// Teams whose schedule a user can see: their home team and any team they lead (admins see all).
// Empty for reporters.
function visibleTeams(user) {
	if (user.role === 'admin') return Team.find().sort({ name: 1 })
	const home = user.team ? [user.team] : []
	return Team.find({ $or: [{ name: { $in: home } }, { lead: user._id }] }).sort({ name: 1 })
}

// A team given by id or by name ("HVAC"). The schedule page sends names today.
const findTeam = (teams, value) =>
	teams.find((t) => String(t._id) === String(value) || t.name.toLowerCase() === String(value).toLowerCase())

// Who is on call for a team at a moment. One query finds the shift covering it.
//   { responder, shift }                 someone is covering that moment
//   { responder: null, reason, shift? }  reason is one of:
//     'no-schedule'         the team has never had shifts
//     'schedule-ended'      its last shift is over
//     'not-covered'         nothing covers that moment (later shifts exist)
//     'responder-inactive'  the person on shift was deactivated (shift is included)
// secondary is the shift's secondary on call (null if none or deactivated).
async function whoIsOnCall(teamId, at = new Date()) {
	const shift = await Shift.findOne({ team: teamId, start: { $lte: at }, end: { $gt: at } })
		.populate('responder', 'name email active')
		.populate('secondary', 'name email active')
	if (shift) {
		const secondary = shift.secondary && shift.secondary.active !== false ? shift.secondary : null
		if (!shift.responder || shift.responder.active === false) return { responder: null, secondary, reason: 'responder-inactive', shift }
		return { responder: shift.responder, secondary, shift }
	}
	if (await Shift.exists({ team: teamId, end: { $gt: at } })) return { responder: null, reason: 'not-covered' }
	const hadShifts = await Shift.exists({ team: teamId })
	return { responder: null, reason: hadShifts ? 'schedule-ended' : 'no-schedule' }
}

// How many open incidents (Open, Acknowledged, Investigating) a person has right now
const activeLoad = (userId) => Ticket.countDocuments({ assignedTo: userId, status: { $in: ACTIVE } })

// Who should get a new ticket for a team right now: the primary on call, unless they already
// have MAX_ACTIVE open incidents; then the secondary, under the same limit.
//   { responder, role: 'primary' | 'secondary', shift, loads }   someone can take it
//   { responder: null, reason, shift?, loads }                    nobody can
// reason is a whoIsOnCall reason, or 'at-capacity' when everyone on call is full.
// loads: [{ _id, name, role, load }] for the people on call
async function onCallAssignee(teamId, at = new Date()) {
	const result = await whoIsOnCall(teamId, at)
	const people = [
		result.responder && { person: result.responder, role: 'primary' },
		result.secondary && { person: result.secondary, role: 'secondary' },
	].filter(Boolean)
	const loads = await Promise.all(people.map(async (p) => ({ _id: p.person._id, name: p.person.name, role: p.role, load: await activeLoad(p.person._id) })))
	if (!people.length) return { responder: null, reason: result.reason, shift: result.shift, loads }
	const free = loads.find((l) => l.load < MAX_ACTIVE)
	if (!free) return { responder: null, reason: 'at-capacity', shift: result.shift, loads }
	const chosen = people.find((p) => String(p.person._id) === String(free._id))
	return { responder: chosen.person, role: chosen.role, shift: result.shift, loads }
}

// What the schedule pages get for each shift. employeeId and shift match the frontend's names.
function toClient(shift) {
	const s = shift.toObject ? shift.toObject() : shift
	return {
		_id: s._id,
		team: s.team,
		date: s.date,
		shift: s.slot,
		employeeId: s.responder?._id ?? s.responder,
		responder: s.responder,
		secondaryId: s.secondary?._id ?? s.secondary ?? null,
		secondary: s.secondary ?? null,
		start: s.start,
		end: s.end,
		createdBy: s.createdBy ?? null,
		createdAt: s.createdAt,
		updatedAt: s.updatedAt,
	}
}

// The plain form the validators use, from a shift populated with team and responder names
const forCheck = (s) => ({
	_id: s._id,
	team: s.team?._id ?? s.team,
	teamName: s.team?.name,
	responder: s.responder?._id ?? s.responder,
	responderName: s.responder?.name ?? 'a deleted account',
	secondary: s.secondary?._id ?? s.secondary ?? null,
	secondaryName: s.secondary?.name ?? 'a deleted account',
	slot: s.slot,
	date: s.date,
	start: s.start,
	end: s.end,
})

module.exports = {
	SLOTS, MAX_ACTIVE, slotTimes, teamProblems, responderProblems, ineligibleReason,
	canManage, visibleTeams, findTeam, whoIsOnCall, onCallAssignee, activeLoad, toClient, forCheck,
}
