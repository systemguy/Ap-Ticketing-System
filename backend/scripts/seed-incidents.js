// Fills the database with realistic fake incidents for the Sprint 5 load test.
//
//   node --env-file=.env scripts/seed-incidents.js --count=1000   replace the test incidents with 1,000 new ones
//   node --env-file=.env scripts/seed-incidents.js --count=0      remove all test incidents
//
// Test incidents have a ticketId starting with PERF-, so they never mix with real ones and can
// be removed in one step. They're spread over every service, severities 1-4 and every status,
// and each has 2-6 timeline events.
//
// Run the backend with ESCALATION_INTERVAL_MS=0 while they're in the database, or escalation
// will start working through the Open ones and notifying people.
// It refuses to run against the live database (named "test") unless you add --allow-live.
const mongoose = require('../database')
const Ticket = require('../app/models/tickets')
const User = require('../app/models/user')
const Service = require('../app/models/services')

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
	const [key, value] = a.replace(/^--/, '').split('=')
	return [key, value ?? true]
}))
const COUNT = Number(args.count)
const TAG = /^PERF-/
const STATUSES = ['Open', 'Acknowledged', 'Investigating', 'Resolved', 'Closed']
const DATE_FIELD = { Acknowledged: 'acknowledgedAt', Investigating: 'investigatingAt', Resolved: 'resolvedAt', Closed: 'closedAt' }
const TITLES = {
	'ac repair': ['AC not cooling', 'AC unit leaking water', 'Thermostat not responding'],
	'pipe repairs': ['Kitchen sink leaking', 'No hot water', 'Toilet keeps running'],
	'infiltration repairs': ['Water stain on ceiling', 'Window leaks when it rains', 'Damp wall in bedroom'],
	'wiring fixes': ['Outlet not working', 'Breaker keeps tripping', 'Sparks from switch'],
	'lighting repairs': ['Hallway light out', 'Bathroom light flickering', 'Porch light stays on'],
	'network setup': ['Wi-Fi not connecting', 'Ethernet port dead', 'Slow internet in unit'],
	'hardware fix': ['Door keypad not working', 'Intercom broken', 'Router lights off'],
}
const NOTES = ['Checked it, ordering a part', 'On my way', 'Fixed for now, will follow up', 'Needs a second visit']
const COMMENTS = ['Still happening', 'Thanks!', 'Any update?', 'It got worse overnight']

const pick = (list, i) => list[i % list.length]
const rand = (n) => Math.floor(Math.random() * n)

async function main() {
	if (!Number.isInteger(COUNT) || COUNT < 0) throw new Error('Usage: --count=N (0 removes the test incidents)')
	await mongoose.connection.asPromise()
	const dbName = mongoose.connection.db.databaseName
	if (dbName === 'test' && !args['allow-live']) throw new Error('This is the live database ("test"). Use a copy, or add --allow-live.')

	const removed = await Ticket.deleteMany({ ticketId: TAG })
	console.log(`[${dbName}] removed ${removed.deletedCount} old test incidents`)
	if (!COUNT) return

	const services = await Service.find().select('name teamId')
	const users = await User.find({ active: { $ne: false } }).select('role team name')
	const reporters = users.filter((u) => u.role === 'user')
	const solvers = (team) => users.filter((u) => u.team === team && u.role !== 'user')
	if (!services.length || !reporters.length) throw new Error('Need at least one service and one resident account')

	const now = Date.now()
	const batch = []
	let written = 0
	for (let i = 0; i < COUNT; i++) {
		const service = pick(services, i)
		const status = pick(STATUSES, rand(STATUSES.length))
		const reporter = pick(reporters, rand(reporters.length))
		const team = solvers(service.teamId)
		const solver = team.length ? pick(team, rand(team.length)) : null
		const createdAt = new Date(now - rand(60 * 24 * 3600e3)) // some time in the last 60 days
		const step = (k) => new Date(+createdAt + k * (5 + rand(120)) * 60e3)
		const titles = TITLES[service.name] ?? ['General request']

		// Timeline: created, auto-assigned, then each status move up to the current one
		const events = [{ type: 'created', actor: reporter._id, createdAt }]
		events.push(solver
			? { type: 'auto_assigned', to: solver.name, createdAt }
			: { type: 'auto_assigned', comment: `No team owns ${service.name} yet`, createdAt })
		const dates = {}
		let from = 'Open'
		for (const to of STATUSES.slice(1, STATUSES.indexOf(status) + 1)) {
			const at = step(events.length)
			events.push({ type: 'status_change', actor: solver?._id ?? reporter._id, from, to, createdAt: at })
			dates[DATE_FIELD[to]] = at
			from = to
		}
		// Pad with notes and comments so every incident has 2-6 events
		const target = Math.max(events.length, 2 + rand(5))
		while (events.length < target) {
			const note = solver && events.length % 2
			events.push(note
				? { type: 'note', actor: solver._id, comment: pick(NOTES, rand(NOTES.length)), createdAt: step(events.length) }
				: { type: 'comment', actor: reporter._id, comment: pick(COMMENTS, rand(COMMENTS.length)), createdAt: step(events.length) })
		}

		batch.push({
			ticketId: `PERF-${String(i + 1).padStart(5, '0')}`,
			userPosted: reporter._id,
			title: pick(titles, rand(titles.length)),
			type: service.name,
			description: `Load test incident ${i + 1}`,
			severity: 1 + rand(4),
			service: service.name,
			status,
			createdAt,
			unit: String(100 + rand(350)),
			resolved: ['Resolved', 'Closed'].includes(status),
			assignedTo: solver?._id,
			events,
			...dates,
		})
		if (batch.length === 1000 || i === COUNT - 1) {
			await Ticket.insertMany(batch.splice(0))
			written = i + 1
			process.stdout.write(`\r  wrote ${written}/${COUNT}`)
		}
	}
	const total = await Ticket.countDocuments()
	console.log(`\n[${dbName}] ${COUNT} test incidents added, ${total} incidents in the database now`)
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => mongoose.disconnect())
