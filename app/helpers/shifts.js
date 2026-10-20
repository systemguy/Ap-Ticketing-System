// On-call schedule rules: the three daily shifts, schedule validation, who can be put on a
// shift, who can change a team's schedule, and who is on call (used for auto-assignment).
const { isValidObjectId } = require('mongoose')
const Shift = require('../models/shift')
const Team = require('../models/team')
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

// A responder can only be on call for one team at a time.
// shifts: [{ team, teamName, responder, responderName, start, end }]
function responderProblems(shifts, now) {
	const byResponder = new Map()
	for (const s of shifts) {
		if (s.end <= now) continue
		const key = String(s.responder)
		if (!byResponder.has(key)) byResponder.set(key, [])
		byResponder.get(key).push(s)
	}
	const problems = []
	for (const list of byResponder.values()) {
		list.sort((a, b) => a.start - b.start)
		let prev = null
		for (const s of list) {
			if (prev && s.start < prev.end && String(s.team) !== String(prev.team)) {
				const until = s.end < prev.end ? s.end : prev.end
				problems.push(`${s.responderName} can't be on call for ${prev.teamName} and ${s.teamName} at the same time, ${formatRange(s.start, until)}`)
			}
			if (!prev || s.end > prev.end) prev = s
		}
	}
	return problems
}

// Why someone can't go on a team's shifts, or null if they can. They must be active staff
// whose home team it is, or the team's lead. Reporters never can.
function ineligibleReason(user, team) {
	if (!user) return 'That person no longer has an account'
	if (user.active === false) return `${user.name}'s account is deactivated`
	if (String(team.lead) === String(user._id) || String(user.team) === String(team._id)) return null
	if (!isValidObjectId(user.team)) return `${user.name} is a reporter and can't be put on a shift`
	return `${user.name} isn't on ${team.name} and doesn't lead it`
}

// Only a team's lead changes its schedule. A future admin role is allowed too.
const canManage = (user, team) => user?.role === 'admin' || String(team.lead) === String(user?._id)

// Teams whose schedule a user can see: their home team and any team they lead (admins see all).
// Empty for reporters.
async function visibleTeams(user) {
	if (user.role === 'admin') return await Team.find().sort({ name: 1 })
	const home = Team.findOne({name: user.team}) 
//isValidObjectId(user.team) ? [user.team] : []
	//console.log(home)
	//const team = Team.find({ $or: [{ _id: { $in: home } }, { lead: user._id }] }).sort({ name: 1 })
	//console.log(team)
	const teams = await Team.find({
		$or: [
		{ name: user.team },
		{ lead: user._id }
		]
	}).sort({ name: 1 });
	return teams

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
async function whoIsOnCall(teamId, at = new Date()) {
	const shift = await Shift.findOne({ team: teamId, start: { $lte: at }, end: { $gt: at } })
		.populate('responder', 'name email active')
	if (shift) {
		if (!shift.responder || shift.responder.active === false) return { responder: null, reason: 'responder-inactive', shift }
		return { responder: shift.responder, shift }
	}
	if (await Shift.exists({ team: teamId, end: { $gt: at } })) return { responder: null, reason: 'not-covered' }
	const hadShifts = await Shift.exists({ team: teamId })
	return { responder: null, reason: hadShifts ? 'schedule-ended' : 'no-schedule' }
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
	slot: s.slot,
	date: s.date,
	start: s.start,
	end: s.end,
})

module.exports = {
	SLOTS, slotTimes, teamProblems, responderProblems, ineligibleReason,
	canManage, visibleTeams, findTeam, whoIsOnCall, toClient, forCheck,
}