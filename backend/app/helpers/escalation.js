// Escalation policy rules: validating a team's chain of levels, working out who a level
// points to, when an open ticket escalates next, and the timer that escalates them.
//
// A ticket escalates while it is Open (nobody has acknowledged it). Level 1's clock starts
// when the ticket is filed; each later level's clock starts when the previous escalation
// happened. Acknowledging the ticket stops escalation; reopening it starts again at level 1.
const { isValidObjectId } = require('mongoose')
const EscalationPolicy = require('../models/escalationPolicy')
const Ticket = require('../models/tickets')
const Service = require('../models/services')
const User = require('../models/user')
const { whoIsOnCall } = require('./shifts')

// Severity 1-4 -> the key its time frame is stored under
const SEVERITY_KEYS = ['low', 'moderate', 'high', 'critical']
const SEVERITY_LABELS = { low: 'Low', moderate: 'Moderate', high: 'High', critical: 'Critical' }
const ASSIGN_TO = ['on-call', 'lead', 'person']
const MAX_LEVELS = 5
const MAX_MINUTES = 7 * 24 * 60 // one week

// What the page offers before a team saves its own policy
const DEFAULT_LEVELS = [
	{ assignTo: 'on-call', after: { low: 480, moderate: 120, high: 30, critical: 10 } },
	{ assignTo: 'lead', after: { low: 1440, moderate: 240, high: 60, critical: 20 } },
]

const severityKey = (severity) => SEVERITY_KEYS[Number(severity) - 1] || 'moderate'

// Why a level can't reach anyone right now (reasons from whoIsOnCall, plus lead/person ones)
const NOBODY = {
	'no-schedule': (team) => `${team} has no on-call schedule`,
	'schedule-ended': (team) => `${team}'s on-call schedule has ended`,
	'not-covered': (team) => `nobody is on call for ${team}`,
	'responder-inactive': (team) => `the person on call for ${team} is deactivated`,
	'no-lead': (team) => `${team} has no team lead`,
	'lead-inactive': (team) => `${team}'s lead is deactivated`,
	'person-missing': () => 'the person chosen for this level no longer has an account',
	'person-inactive': (team, name) => `${name} is deactivated`,
}

// Staff have a home team; reporters are stored with team "user"
const isStaff = (u) => Boolean(u?.team) && u.team !== 'user'

// Who a level gives the ticket to at a moment.
// team must have `lead` populated with name and active.
//   { user: { _id, name } }           someone can take it
//   { user: null, reason: '...' }     nobody can (reason is a sentence fragment)
async function resolveLevel(level, team, at = new Date(), people = new Map()) {
	if (level.assignTo === 'on-call') {
		const result = await whoIsOnCall(team._id, at)
		if (result.responder) return { user: { _id: result.responder._id, name: result.responder.name }, until: result.shift?.end ?? null }
		return { user: null, reason: NOBODY[result.reason](team.name) }
	}
	if (level.assignTo === 'lead') {
		if (!team.lead) return { user: null, reason: NOBODY['no-lead'](team.name) }
		if (team.lead.active === false) return { user: null, reason: NOBODY['lead-inactive'](team.name) }
		return { user: { _id: team.lead._id, name: team.lead.name } }
	}
	const id = String(level.person?._id ?? level.person ?? '')
	let person = people.get(id)
	if (person === undefined) {
		person = isValidObjectId(id) ? await User.findById(id).select('name active') : null
		people.set(id, person)
	}
	if (!person) return { user: null, reason: NOBODY['person-missing']() }
	if (person.active === false) return { user: null, reason: NOBODY['person-inactive'](team.name, person.name) }
	return { user: { _id: person._id, name: person.name } }
}

// Checks a chain sent by the page and returns { levels, errors }.
// levels: [{ assignTo, person?, after: { low, moderate, high, critical } }]
async function validateLevels(input) {
	const errors = []
	if (!Array.isArray(input) || input.length === 0) {
		return { levels: [], errors: ['Add at least one escalation level'] }
	}
	if (input.length > MAX_LEVELS) {
		return { levels: [], errors: [`A policy can have at most ${MAX_LEVELS} levels`] }
	}
	const levels = []
	for (const [i, raw] of input.entries()) {
		const n = i + 1
		const assignTo = raw?.assignTo
		if (!ASSIGN_TO.includes(assignTo)) {
			errors.push(`Level ${n}: choose who the ticket goes to`)
			continue
		}
		const level = { assignTo, after: {} }
		if (assignTo === 'person') {
			const id = raw.person?._id ?? raw.person
			const person = isValidObjectId(id) ? await User.findById(id).select('name team role active') : null
			if (!person) {
				errors.push(`Level ${n}: choose a person`)
			} else if (person.active === false) {
				errors.push(`Level ${n}: ${person.name}'s account is deactivated`)
			} else if (!isStaff(person) && person.role !== 'admin') {
				errors.push(`Level ${n}: ${person.name} is a reporter. Escalations go to responders or admins.`)
			} else {
				level.person = person._id
			}
		}
		for (const key of SEVERITY_KEYS) {
			const minutes = Number(raw?.after?.[key])
			if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
				errors.push(`Level ${n}: the ${SEVERITY_LABELS[key]} time frame must be between 1 minute and 7 days`)
			} else {
				level.after[key] = minutes
			}
		}
		levels.push(level)
	}
	// The same fixed target twice in a row would reassign a ticket to the person who already has it
	for (let i = 1; i < levels.length; i++) {
		const a = levels[i - 1], b = levels[i]
		const same = a.assignTo === b.assignTo && (a.assignTo !== 'person' || String(a.person) === String(b.person))
		if (same && a.assignTo !== 'on-call') {
			errors.push(`Levels ${i} and ${i + 1} go to the same person. Pick someone else for level ${i + 1}.`)
		}
	}
	return { levels, errors }
}

// When an Open ticket escalates next under a policy, or null when it won't.
//   { level, step, dueAt }   level is 1-based; step is the policy level it will move to
//   { done: true }           it has already gone through every level
function nextEscalation(ticket, policy) {
	if (!policy?.enabled || !policy.levels?.length || ticket.status !== 'Open') return null
	const reached = ticket.escalationLevel || 0
	if (reached >= policy.levels.length) return { done: true }
	const step = policy.levels[reached]
	const clock = new Date(ticket.escalationClockAt || ticket.createdAt)
	const minutes = step.after[severityKey(ticket.severity)]
	return { level: reached + 1, step, dueAt: new Date(clock.getTime() + minutes * 60000) }
}

// Escalates every Open ticket whose time is up, one level per ticket per run.
// Returns how many tickets moved.
async function runEscalations(now = new Date()) {
	const policies = await EscalationPolicy.find({ enabled: true })
		.populate({ path: 'team', populate: { path: 'lead', select: 'name active' } })
	let moved = 0
	for (const policy of policies) {
		if (!policy.team || !policy.levels.length) continue
		const services = await Service.find({ teamId: policy.team.name }).select('name')
		if (!services.length) continue
		const tickets = await Ticket.find({ status: 'Open', service: { $in: services.map((s) => s.name) } })
			.select('status severity createdAt escalationLevel escalationClockAt assignedTo')
			.populate('assignedTo', 'name')
		const people = new Map()
		for (const ticket of tickets) {
			const next = nextEscalation(ticket, policy)
			if (!next || next.done || next.dueAt > now) continue
			const target = await resolveLevel(next.step, policy.team, now, people)
			const current = ticket.assignedTo
			const event = { type: 'escalated', level: next.level, from: current?.name, createdAt: now }
			const set = { escalationLevel: next.level, escalationClockAt: now }
			if (!target.user) {
				event.comment = `Nobody could take it: ${target.reason}`
			} else if (current && String(current._id) === String(target.user._id)) {
				event.to = target.user.name
				event.comment = `${target.user.name} already had it`
			} else {
				event.to = target.user.name
				set.assignedTo = target.user._id
			}
			// Matching on status and level skips tickets someone acknowledged (or the timer
			// already moved) since we read them
			const reached = ticket.escalationLevel || 0
			const updated = await Ticket.findOneAndUpdate(
				{ _id: ticket._id, status: 'Open', escalationLevel: reached === 0 ? { $in: [0, null] } : reached },
				{ $set: set, $push: { events: event } })
			if (updated) moved++
		}
	}
	return moved
}

// Runs runEscalations every minute (ESCALATION_INTERVAL_MS overrides; 0 turns it off)
function startEscalationTimer() {
	const every = Number(process.env.ESCALATION_INTERVAL_MS ?? 60000)
	if (!every) return null
	let running = false
	return setInterval(async () => {
		if (running) return
		running = true
		try {
			const moved = await runEscalations()
			if (moved) console.log(`Escalated ${moved} ticket${moved === 1 ? '' : 's'}`)
		} catch (err) {
			console.error('Escalation run failed:', err.message)
		} finally {
			running = false
		}
	}, every)
}

module.exports = {
	SEVERITY_KEYS, DEFAULT_LEVELS, MAX_LEVELS, MAX_MINUTES,
	severityKey, resolveLevel, validateLevels, nextEscalation, runEscalations, startEscalationTimer,
}
