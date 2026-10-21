// Seeds the Sprint 3 roster and one week of on-call shifts.
//
//   node scripts/seed-shifts.js            preview: prints the plan and writes nothing
//   node scripts/seed-shifts.js --apply    writes to the database in MONGODB_URI (.env)
//
// Options
//   --days=7                               how many days ahead to schedule
//   --end-team=OIT --end-date=2026-10-23   that team's schedule stops at the end of that day
//   --swap                                 Morgan takes Tim's HVAC mornings (for the re-run test)
//
// Users and services store their team by name (HVAC, Plumbing, Electrical, OIT), matching the
// live database. New accounts get the password in SEED_PASSWORD; existing accounts keep theirs.
// Re-running replaces the current and upcoming shifts of these four teams. Tickets keep the
// responder they were assigned to, because the assignment is saved on the ticket.
const mongoose = require('../database')
const owasp = require('owasp-password-strength-test')
const Team = require('../app/models/team')
const User = require('../app/models/user')
const Service = require('../app/models/services')
const Shift = require('../app/models/shift')
const { SLOTS, slotTimes, teamProblems, responderProblems } = require('../app/helpers/shifts')
const { centralMoment, centralDate, addDays, dayNumber, isDateKey, formatDay, formatTime } = require('../app/helpers/time')

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
	const [key, value] = a.replace(/^--/, '').split('=')
	return [key, value ?? true]
}))
const APPLY = Boolean(args.apply)
const DAYS = Number(args.days ?? 7)
const END_TEAM = args['end-team'] ?? 'OIT'
const END_DATE = args['end-date'] ?? '2026-10-23'
const SWAP = Boolean(args.swap)

// Teams and the services each one owns (the same names as the frontend's service list)
const TEAMS = {
	HVAC: ['ac repair'],
	Plumbing: ['pipe repairs', 'infiltration repairs'],
	Electrical: ['wiring fixes', 'lighting repairs'],
	OIT: ['network setup', 'hardware fix'],
}
// A service no team owns, for the "service has no owning team" case
const UNOWNED_SERVICE = 'general request'

// Six responders. Morgan leads HVAC, Plumbing and Electrical and is on their rota.
// Jordan leads OIT and is not on the rota.
const ROSTER = [
	{ key: 'morgan', name: 'Morgan Lee', email: 'morgan.lee@residence.test', team: 'HVAC', leads: ['HVAC', 'Plumbing', 'Electrical'] },
	{ key: 'jordan', name: 'Jordan Price', email: 'jordan.price@residence.test', team: 'OIT', leads: ['OIT'] },
	{ key: 'tim', name: 'Tim Walker', email: 'tim.walker@residence.test', team: 'HVAC' },
	{ key: 'jane', name: 'Jane Foster', email: 'jane.foster@residence.test', team: 'Plumbing' },
	{ key: 'sam', name: 'Sam Ortiz', email: 'sam.ortiz@residence.test', team: 'Electrical' },
	{ key: 'nina', name: 'Nina Shah', email: 'nina.shah@residence.test', team: 'OIT' },
]
const MEMBER = { HVAC: 'tim', Plumbing: 'jane', Electrical: 'sam', OIT: 'nina' }

// Who covers a slot. Morgan takes one slot per team each day, never two at once, alternating
// between even and odd days. With --swap, Morgan takes the HVAC mornings (Tim's otherwise).
function coverFor(team, slot, date) {
	if (team === 'OIT') return 'nina'
	const even = dayNumber(date) % 2 === 0
	const morgan = SWAP
		? { HVAC: 'morning', Plumbing: even ? 'overnight' : null, Electrical: even ? null : 'evening' }
		: { HVAC: even ? 'evening' : 'overnight', Plumbing: even ? 'overnight' : 'morning', Electrical: even ? 'morning' : 'evening' }
	return morgan[team] === slot ? 'morgan' : MEMBER[team]
}

// The slot happening right now, so coverage starts at this moment
function currentSlot(now) {
	const today = centralDate(now)
	for (const date of [addDays(today, -1), today]) {
		for (const slot of Object.keys(SLOTS)) {
			const { start, end } = slotTimes(date, slot)
			if (start <= now && now < end) return { date, slot }
		}
	}
}

// Every shift from the current slot through DAYS days ahead. teamIds and people say how each
// team and person is identified: database ids when writing, names when previewing.
function buildPlan(now, teamIds, people) {
	const order = Object.keys(SLOTS)
	const first = currentSlot(now)
	const lastDate = addDays(centralDate(now), DAYS)
	const endOfEndDate = centralMoment(addDays(END_DATE, 1), 0)
	const plan = []
	for (let date = first.date; date <= lastDate; date = addDays(date, 1)) {
		for (const slot of order) {
			if (date === first.date && order.indexOf(slot) < order.indexOf(first.slot)) continue
			const { start, end } = slotTimes(date, slot)
			for (const team of Object.keys(TEAMS)) {
				if (team === END_TEAM && end > endOfEndDate) continue
				const person = people[coverFor(team, slot, date)]
				plan.push({ team: teamIds[team], teamName: team, responder: person.id, responderName: person.name, slot, date, start, end })
			}
		}
	}
	return plan
}

const when = (at) => `${formatDay(at)}, ${formatTime(at)}`

async function main() {
	if (!(DAYS >= 1 && DAYS <= 31) || !TEAMS[END_TEAM] || !isDateKey(END_DATE)) {
		throw new Error('Check the options: --days is 1 to 31, --end-team is a team name, --end-date is YYYY-MM-DD')
	}
	const now = new Date()
	console.log(APPLY ? 'Seeding: writing to the database.' : 'Preview only. Add --apply to write to the database.')

	// Check the plan before writing anything (names stand in for ids)
	const byName = Object.fromEntries(Object.keys(TEAMS).map((t) => [t, t]))
	const byKey = Object.fromEntries(ROSTER.map((r) => [r.key, { id: r.key, name: r.name }]))
	const preview = buildPlan(now, byName, byKey)
	const problems = [
		...Object.keys(TEAMS).flatMap((t) => teamProblems(t, preview.filter((s) => s.teamName === t), now)),
		...responderProblems(preview, now),
	]
	if (problems.length) {
		throw new Error(`The plan has problems, so nothing was written:\n  ${problems.join('\n  ')}`)
	}

	if (APPLY) {
		const missing = []
		for (const r of ROSTER) if (!(await User.exists({ email: r.email }))) missing.push(r.email)
		owasp.config({ allowPassphrases: false })
		if (missing.length && !(process.env.SEED_PASSWORD && owasp.test(process.env.SEED_PASSWORD).strong)) {
			throw new Error(`Set SEED_PASSWORD to a strong password to create: ${missing.join(', ')}`)
		}

		const teamIds = {}
		for (const name of Object.keys(TEAMS)) {
			const team = (await Team.findOne({ name })) ?? (await Team.create({ name }))
			teamIds[name] = team._id
		}
		const people = {}
		for (const r of ROSTER) {
			const team = r.team
			let user = await User.findOne({ email: r.email })
			if (user) {
				// Existing account: make sure it's active staff on the right team. Its password stays.
				await User.updateOne({ _id: user._id }, { $set: { role: 'solver', team, active: true } })
			} else {
				user = await new User({ name: r.name, email: r.email, password: process.env.SEED_PASSWORD, role: 'solver', team }).save()
			}
			people[r.key] = { id: user._id, name: user.name }
		}
		for (const r of ROSTER) {
			for (const name of r.leads ?? []) await Team.updateOne({ _id: teamIds[name] }, { $set: { lead: people[r.key].id } })
		}
		for (const [name, services] of Object.entries(TEAMS)) {
			for (const service of services) {
				await Service.updateOne({ name: service }, { $set: { teamId: name } }, { upsert: true })
			}
		}
		await Service.updateOne({ name: UNOWNED_SERVICE }, { $unset: { teamId: 1 } }, { upsert: true })

		const plan = buildPlan(now, teamIds, people)
		const removed = await Shift.deleteMany({ team: { $in: Object.values(teamIds) }, end: { $gt: now } })
		await Shift.insertMany(plan.map(({ teamName, responderName, ...s }) => s))
		console.log(`Replaced ${removed.deletedCount} current and upcoming shifts with ${plan.length}.`)
	}

	console.log('\nLeads: Morgan Lee leads HVAC, Plumbing and Electrical (on the rota). Jordan Price leads OIT (not on the rota).')
	for (const team of Object.keys(TEAMS)) {
		const own = preview.filter((s) => s.teamName === team)
		console.log(`  ${team.padEnd(11)} ${String(own.length).padStart(2)} shifts, ${when(own[0].start)} to ${when(own.at(-1).end)}`)
	}
	console.log(`Service with no owning team: "${UNOWNED_SERVICE}"`)
	if (SWAP) console.log('Swap: Morgan has the HVAC mornings.')

	// The professor's test window, 8 AM to 2 PM, on submission day and the day after
	for (const date of [END_DATE, addDays(END_DATE, 1)]) {
		const from = centralMoment(date, 8)
		const to = centralMoment(date, 14)
		if (to <= now) continue
		const on = preview.filter((s) => s.start < to && s.end > from)
		const names = [...new Set(on.map((s) => s.responderName))]
		const off = ROSTER.map((r) => r.name).filter((n) => !names.includes(n))
		console.log(`\n${formatDay(from)}, 8 AM to 2 PM`)
		for (const team of Object.keys(TEAMS)) {
			const covering = on.filter((s) => s.teamName === team).map((s) => `${s.responderName} (${s.slot})`)
			console.log(`  ${team.padEnd(11)} ${covering.join(', ') || 'no one on call'}`)
		}
		console.log(`  Not on call: ${off.join(', ')}`)
	}
}

main()
	.catch((err) => {
		console.error(`\n${err.message}`)
		process.exitCode = 1
	})
	.finally(() => mongoose.disconnect())
