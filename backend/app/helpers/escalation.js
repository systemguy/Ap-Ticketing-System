// Escalation policy rules: validating a team's chain of levels, working out who a level
// points to, when an open ticket escalates next, and the timer that escalates them.
//
// A ticket escalates while it is Open (nobody has acknowledged it). Writing a note doesn't stop
// it; only acknowledging does. Level 1's clock starts when the ticket is filed; each later step's
// clock starts when the previous step was due. Reopening a ticket starts again at level 1.
//
// Tier 1 is the first person the ticket is escalated TO. The person it's first assigned to is
// whoever was on call when it was filed (see POST /tickets/create). After the last level comes
// the final step: the ticket is unassigned, pinned to the top of the team's queue, and the team
// lead and admins (facility administration) are notified.
//
// The timer runs on the server every 30 seconds (ESCALATION_INTERVAL_MS), so it works with
// every browser closed. If the server was down and several steps are overdue at once, it moves
// the ticket straight to where it should be now, records every step on the timeline, and only
// notifies the person who has it now.
const { isValidObjectId } = require('mongoose')
const EscalationPolicy = require('../models/escalationPolicy')
const Ticket = require('../models/tickets')
const Service = require('../models/services')
const User = require('../models/user')
const { whoIsOnCall } = require('./shifts')
const { notifyAssigned, notifyFinal } = require('./notify')

// Severity 1-4 -> the key its time frame is stored under
const SEVERITY_KEYS = ['low', 'moderate', 'high', 'critical']
const SEVERITY_LABELS = { low: 'Low', moderate: 'Moderate', high: 'High', critical: 'Critical' }
const ASSIGN_TO = ['on-call', 'lead', 'person']
const MAX_LEVELS = 5
const MAX_MINUTES = 7 * 24 * 60 // one week

// What the page offers before a team saves its own policy. Level 1 is the team lead because the
// on-call solver already has the ticket from the moment it's filed.
const DEFAULT_LEVELS = [
	{ assignTo: 'lead', after: { low: 240, moderate: 60, high: 20, critical: 10 } },
]
const DEFAULT_FINAL = { low: 480, moderate: 120, high: 30, critical: 15 }

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

// Who a specific-person level may point to for a team: someone on the team, the team's lead,
// or an admin (building management). This keeps one team's people out of another's chain,
// including when a lead copies a policy between teams.
function personProblem(person, team) {
	if (!person) return 'that person no longer has an account'
	if (person.active === false) return `${person.name}'s account is deactivated`
	const lead = String(team.lead?._id ?? team.lead ?? '')
	if (person.role === 'admin' || person.team === team.name || String(person._id) === lead) return null
	if (!person.team || person.team === 'user') return `${person.name} is a reporter. Escalations go to ${team.name}'s people or admins.`
	return `${person.name} isn't on ${team.name}. Escalations go to ${team.name}'s people, its lead, or admins.`
}

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
		person = isValidObjectId(id) ? await User.findById(id).select('name active team role') : null
		people.set(id, person)
	}
	if (!person) return { user: null, reason: NOBODY['person-missing']() }
	if (person.active === false) return { user: null, reason: NOBODY['person-inactive'](team.name, person.name) }
	// They may have moved teams since the policy was saved; then they couldn't work the ticket
	const problem = personProblem(person, team)
	if (problem) return { user: null, reason: problem.replace(/\.$/, '') }
	return { user: { _id: person._id, name: person.name } }
}

// Checks one set of per-severity time frames. Returns { after, errors }.
// Each must be a whole number of minutes from 1 to 7 days, and severity has to matter:
// higher severity never waits longer, and Critical is strictly faster than Low.
function checkTimes(raw, label) {
	const errors = []
	const after = {}
	for (const key of SEVERITY_KEYS) {
		const minutes = Number(raw?.[key])
		if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
			errors.push(`${label}: the ${SEVERITY_LABELS[key]} time frame must be a whole number of minutes between 1 minute and 7 days`)
		} else {
			after[key] = minutes
		}
	}
	if (!errors.length) {
		if (!(after.low >= after.moderate && after.moderate >= after.high && after.high >= after.critical)) {
			errors.push(`${label}: a more severe ticket can't wait longer than a less severe one (Low ≥ Moderate ≥ High ≥ Critical)`)
		} else if (after.critical >= after.low) {
			errors.push(`${label}: severity must make a difference, so Critical has to escalate faster than Low`)
		}
	}
	return { after, errors }
}

// Checks a policy sent by the page for one team and returns { levels, finalAfter, errors }.
// levels: [{ assignTo, person?, after: { low, moderate, high, critical } }]
// finalAfter: { low, moderate, high, critical }, how long the last level has before the final step
// team: the Team document (lead may be populated or an id)
async function validatePolicy(input, finalInput, team) {
	const errors = []
	if (!Array.isArray(input) || input.length === 0) {
		return { levels: [], finalAfter: null, errors: ['Add at least one escalation level'] }
	}
	if (input.length > MAX_LEVELS) {
		return { levels: [], finalAfter: null, errors: [`A policy can have at most ${MAX_LEVELS} levels`] }
	}
	const levels = []
	for (const [i, raw] of input.entries()) {
		const n = i + 1
		const assignTo = raw?.assignTo
		if (!ASSIGN_TO.includes(assignTo)) {
			errors.push(`Level ${n}: choose who the ticket goes to`)
			continue
		}
		const level = { assignTo }
		if (assignTo === 'person') {
			const id = raw.person?._id ?? raw.person
			const person = isValidObjectId(id) ? await User.findById(id).select('name team role active') : null
			if (!person) {
				errors.push(`Level ${n}: choose a person`)
			} else {
				const problem = personProblem(person, team)
				if (problem) errors.push(`Level ${n}: ${problem}`)
				else level.person = person._id
			}
		}
		const times = checkTimes(raw?.after, `Level ${n}`)
		errors.push(...times.errors)
		level.after = times.after
		levels.push(level)
	}
	const final = checkTimes(finalInput, 'Final step')
	errors.push(...final.errors)
	// The same fixed target twice in a row would reassign a ticket to the person who already has it
	for (let i = 1; i < levels.length; i++) {
		const a = levels[i - 1], b = levels[i]
		const same = a.assignTo === b.assignTo && (a.assignTo !== 'person' || String(a.person) === String(b.person))
		if (same && a.assignTo !== 'on-call') {
			errors.push(`Levels ${i} and ${i + 1} go to the same person. Pick someone else for level ${i + 1}.`)
		}
	}
	return { levels, finalAfter: final.after, errors }
}

// The final step's time frames, for policies saved before it existed
const finalTimes = (policy) => policy.finalAfter?.low ? policy.finalAfter : policy.levels[policy.levels.length - 1].after

// When an Open ticket takes its next step under a policy, or null when it won't.
//   { level, step, dueAt }        it moves to policy level `level` (1-based) at dueAt
//   { final: true, dueAt }        it reaches the final escalation state at dueAt
//   { done: true }                it already reached the final state
// state overrides the ticket's escalationLevel / escalationClockAt (used while catching up).
function nextEscalation(ticket, policy, state = {}) {
	if (!policy?.enabled || !policy.levels?.length || ticket.status !== 'Open') return null
	if (ticket.escalationExhaustedAt) return { done: true }
	const reached = state.level ?? (ticket.escalationLevel || 0)
	let clock = new Date(state.clock ?? ticket.escalationClockAt ?? ticket.createdAt)
	// A ticket filed before escalation was switched on counts from when it was switched on
	if (policy.enabledAt && clock < policy.enabledAt) clock = new Date(policy.enabledAt)
	const key = severityKey(ticket.severity)
	if (reached >= policy.levels.length) {
		return { final: true, level: policy.levels.length, dueAt: new Date(clock.getTime() + finalTimes(policy)[key] * 60000) }
	}
	const step = policy.levels[reached]
	return { level: reached + 1, step, dueAt: new Date(clock.getTime() + step.after[key] * 60000) }
}

// Moves one ticket through every step that is due by `now`. Returns true if it changed.
async function escalateTicket(ticket, policy, now, people, admins) {
	const team = policy.team
	const original = { level: ticket.escalationLevel || 0, clock: ticket.escalationClockAt ?? null }
	let level = original.level
	let clock = ticket.escalationClockAt ?? ticket.createdAt
	let holder = ticket.assignedTo ? { _id: ticket.assignedTo._id, name: ticket.assignedTo.name } : null
	let assignedAtLevel = null // the level that gave the ticket to its current holder, this run
	let final = false
	const events = []

	for (let guard = 0; guard <= MAX_LEVELS + 1; guard++) {
		const next = nextEscalation(ticket, policy, { level, clock })
		if (!next || next.done || next.dueAt > now) break
		if (next.final) {
			events.push({ type: 'final_escalation', level: next.level, from: holder?.name, createdAt: now })
			final = true
			clock = next.dueAt
			break
		}
		const target = await resolveLevel(next.step, team, now, people)
		const event = { type: 'escalated', level: next.level, from: holder?.name, createdAt: now }
		if (!target.user) {
			event.comment = `Nobody could take it: ${target.reason}`
		} else if (holder && String(holder._id) === String(target.user._id)) {
			event.to = target.user.name
			event.comment = `${target.user.name} already had it`
		} else {
			event.to = target.user.name
			holder = target.user
			assignedAtLevel = next.level
		}
		events.push(event)
		level = next.level
		clock = next.dueAt
	}
	if (!events.length) return false

	// Catching up after downtime: every step but the last was passed straight through, and only
	// whoever has the ticket now is notified
	events.forEach((e, i) => { if (i < events.length - 1 && e.type === 'escalated') e.skipped = true })

	const set = { escalationLevel: level, escalationClockAt: clock }
	const update = { $set: set, $push: { events: { $each: events } } }
	if (final) {
		set.escalationExhaustedAt = now
		update.$unset = { assignedTo: 1 }
	} else if (assignedAtLevel) {
		set.assignedTo = holder._id
	}
	// Matching on the level and clock we read skips tickets someone acknowledged or reopened since
	const updated = await Ticket.findOneAndUpdate(
		{
			_id: ticket._id,
			status: 'Open',
			escalationExhaustedAt: null,
			escalationLevel: original.level === 0 ? { $in: [0, null] } : original.level,
			escalationClockAt: original.clock,
		},
		update,
		{ returnDocument: 'after' })
	if (!updated) return false

	if (final) {
		await notifyFinal(updated, team.name, [team.lead?._id, ...admins()])
		console.log(`[escalation] ${ticket._id} reached the final step for ${team.name}`)
	} else if (assignedAtLevel) {
		await notifyAssigned(updated, holder._id, { how: 'escalation', level: assignedAtLevel })
		console.log(`[escalation] ${ticket._id} -> level ${assignedAtLevel} (${holder.name})`)
	}
	return true
}

// Escalates every Open ticket whose time is up. Returns how many tickets changed.
async function runEscalations(now = new Date()) {
	const policies = await EscalationPolicy.find({ enabled: true })
		.populate({ path: 'team', populate: { path: 'lead', select: 'name active' } })
	let adminIds = null
	const loadAdmins = async () => {
		if (!adminIds) adminIds = (await User.find({ role: 'admin', active: { $ne: false } }).select('_id')).map((u) => u._id)
		return adminIds
	}
	let moved = 0
	for (const policy of policies) {
		if (!policy.team || !policy.levels.length) continue
		const services = await Service.find({ teamId: policy.team.name }).select('name')
		if (!services.length) continue
		const tickets = await Ticket.find({ status: 'Open', escalationExhaustedAt: null, service: { $in: services.map((s) => s.name) } })
			.select('title unit service status severity createdAt escalationLevel escalationClockAt escalationExhaustedAt assignedTo')
			.populate('assignedTo', 'name')
		const people = new Map()
		const admins = await loadAdmins()
		for (const ticket of tickets) {
			try {
				if (await escalateTicket(ticket, policy, now, people, () => admins)) moved++
			} catch (err) {
				console.error(`[escalation] ticket ${ticket._id} failed: ${err.message}`)
			}
		}
	}
	return moved
}

// Runs runEscalations every 30 seconds (ESCALATION_INTERVAL_MS overrides; 0 turns it off),
// plus once shortly after the server starts so anything overdue during downtime catches up.
function startEscalationTimer() {
	const every = Number(process.env.ESCALATION_INTERVAL_MS ?? 30000)
	if (!every) return null
	let running = false
	const tick = async () => {
		if (running) return
		running = true
		try {
			const moved = await runEscalations()
			if (moved) console.log(`[escalation] ${moved} ticket${moved === 1 ? '' : 's'} moved`)
		} catch (err) {
			console.error('[escalation] run failed:', err.message)
		} finally {
			running = false
		}
	}
	setTimeout(tick, 5000)
	return setInterval(tick, every)
}

module.exports = {
	SEVERITY_KEYS, DEFAULT_LEVELS, DEFAULT_FINAL, MAX_LEVELS, MAX_MINUTES,
	severityKey, personProblem, resolveLevel, checkTimes, validatePolicy, finalTimes, nextEscalation,
	runEscalations, startEscalationTimer,
}
