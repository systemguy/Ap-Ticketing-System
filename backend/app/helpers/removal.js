// What stops something from being deleted (Sprint 5 soft deletion).
//
// Our rule, the same for every case: deletion is refused until the problem is fixed by hand.
// Each function returns a list of plain-English problems; an empty list means it can go.
//   - a person: their current and future on-call shifts, teams they lead, escalation levels that
//     name them, and open incidents assigned to them
//   - a service: its open incidents
//   - a team: the services it owns, its members, and its current and future shifts
// The same checks run when a person moves to another team (only that team's items count then).
const Team = require('../models/team')
const User = require('../models/user')
const Service = require('../models/services')
const Ticket = require('../models/tickets')
const Shift = require('../models/shift')
const EscalationPolicy = require('../models/escalationPolicy')
const { ACTIVE_STATUSES } = require('./tickets')
const { NOT_DELETED } = require('./softDelete')
const { formatDay, formatTime } = require('./time')

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const when = (s) => `${formatDay(s.start)}, ${formatTime(s.start)}`

// Open incidents (Open, Acknowledged, Investigating) that haven't been deleted
const openTickets = (match) => Ticket.find({ ...match, ...NOT_DELETED, status: { $in: ACTIVE_STATUSES } }).select('title status service')

// Names of the services a team owns (deleted ones included: their old tickets still count)
const servicesOf = async (teamName) => (await Service.find({ teamId: teamName }).select('name')).map((s) => s.name)

// Problems with deleting a person. With onlyTeam (a team name), only that team's shifts,
// escalation levels and incidents count: used when they move to another team.
async function personProblems(person, { onlyTeam = null } = {}) {
	const now = new Date()
	const problems = []
	const scopeTeam = onlyTeam ? await Team.findOne({ name: onlyTeam }).select('_id') : null

	const shifts = await Shift.find({
		$or: [{ responder: person._id }, { secondary: person._id }],
		end: { $gt: now },
		...(scopeTeam ? { team: scopeTeam._id } : {}),
	}).sort({ start: 1 }).populate('team', 'name')
	const byTeam = new Map()
	for (const s of shifts) {
		const name = s.team?.name ?? 'a deleted team'
		byTeam.set(name, [...(byTeam.get(name) ?? []), s])
	}
	for (const [team, list] of byTeam) {
		problems.push(`is on ${plural(list.length, 'current or upcoming on-call shift')} for ${team} (first: ${when(list[0])}). Give those shifts to someone else on the Schedule page.`)
	}

	if (!onlyTeam) {
		const led = await Team.find({ lead: person._id, ...NOT_DELETED }).select('name')
		if (led.length) problems.push(`leads ${led.map((t) => t.name).join(', ')}. Choose a new team lead first.`)
	}

	const policies = await EscalationPolicy.find({ 'levels.person': person._id }).populate('team', 'name active')
	for (const p of policies) {
		if (!p.team || p.team.active === false || (onlyTeam && p.team.name !== onlyTeam)) continue
		const levels = p.levels.map((l, i) => (String(l.person) === String(person._id) ? i + 1 : null)).filter(Boolean)
		problems.push(`is named in level ${levels.join(' and ')} of ${p.team.name}'s escalation policy. Change ${levels.length > 1 ? 'those levels' : 'that level'} first.`)
	}

	const tickets = await openTickets({
		assignedTo: person._id,
		...(onlyTeam ? { service: { $in: await servicesOf(onlyTeam) } } : {}),
	})
	if (tickets.length) {
		problems.push(`has ${plural(tickets.length, 'open incident')} assigned (${tickets.slice(0, 3).map((t) => `"${t.title}"`).join(', ')}${tickets.length > 3 ? ', ...' : ''}). Reassign or close them first.`)
	}
	return problems
}

async function serviceProblems(service) {
	const tickets = await openTickets({ service: service.name })
	return tickets.length
		? [`has ${plural(tickets.length, 'open incident')} (${tickets.slice(0, 3).map((t) => `"${t.title}"`).join(', ')}${tickets.length > 3 ? ', ...' : ''}). Resolve or close them first.`]
		: []
}

async function teamProblems(team) {
	const now = new Date()
	const problems = []
	const services = await Service.find({ teamId: team.name, ...NOT_DELETED }).select('name')
	if (services.length) problems.push(`owns ${plural(services.length, 'service')} (${services.map((s) => s.name).join(', ')}). Move them to another team or delete them first.`)
	const members = await User.find({ team: team.name, ...NOT_DELETED }).select('name')
	if (members.length) problems.push(`has ${plural(members.length, 'member')} (${members.slice(0, 4).map((m) => m.name).join(', ')}${members.length > 4 ? ', ...' : ''}). Move them to another team first.`)
	const shifts = await Shift.countDocuments({ team: team._id, end: { $gt: now } })
	if (shifts) problems.push(`has ${plural(shifts, 'current or upcoming on-call shift')}. Remove them on the Schedule page first.`)
	return problems
}

// The error sent back when something can't be deleted yet
const refusal = (what, problems) => ({
	error: `${what} can't be deleted yet. ${what} ${problems[0]}${problems.length > 1 ? ` (and ${plural(problems.length - 1, 'more problem')})` : ''}`,
	problems: problems.map((p) => `${what} ${p}`),
})

module.exports = { personProblems, serviceProblems, teamProblems, refusal }
