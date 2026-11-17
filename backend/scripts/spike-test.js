// Spike test: 100 residents file incidents within 200 ms (a building-wide outage), while an
// admin keeps loading the Team Queue.
//
//   PERF_PASSWORD=... node --env-file=.env scripts/spike-test.js --resident=r@example.com --admin=a@example.com
//
// Options
//   --api=http://localhost:3000   backend to test
//   --count=100 --gap=2           100 incidents, one every 2 ms
//   --query-log=/tmp/q.log        the backend's QUERY_LOG file; adds database operations per incident
//   --cleanup                     only remove the incidents from earlier spike runs
//
// Needs MONGODB_URI (from .env) for the checks afterward. Spike incidents have titles starting
// with SPIKE-; each run removes the previous run's ones (and their notifications) first, so
// every run starts with the same on-call load.
const fs = require('fs')
const mongoose = require('../database')
const Ticket = require('../app/models/tickets')
const Notification = require('../app/models/notification')
const Service = require('../app/models/services')
const Shift = require('../app/models/shift')
const { MAX_ACTIVE } = require('../app/helpers/shifts')
const { ACTIVE_STATUSES } = require('../app/helpers/tickets')

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
	const [key, value] = a.replace(/^--/, '').split('=')
	return [key, value ?? true]
}))
const API = args.api ?? 'http://localhost:3000'
const COUNT = Number(args.count ?? 100)
const GAP = Number(args.gap ?? 2)
const TARGET_MS = 2000 // our incident submission target (Performance page)
const PASSWORD = process.env.PERF_PASSWORD ?? process.env.SEED_PASSWORD
const TAG = /^SPIKE-/
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (n) => Math.round(n * 10) / 10
const avg = (l) => l.reduce((a, b) => a + b, 0) / l.length
const pct = (l, p) => [...l].sort((a, b) => a - b)[Math.min(l.length - 1, Math.ceil((p / 100) * l.length) - 1)]

async function login(email) {
	const res = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
	const { token, error } = await res.json()
	if (!token) throw new Error(`Login failed for ${email}: ${error}`)
	return token
}

async function loadQueue(token) {
	const start = performance.now()
	const res = await fetch(`${API}/tickets`, { headers: { Authorization: `Bearer ${token}` } })
	await res.arrayBuffer()
	return performance.now() - start
}

async function cleanup() {
	const old = await Ticket.find({ title: TAG }).select('_id')
	await Notification.deleteMany({ ticket: { $in: old.map((t) => t._id) } })
	await Ticket.deleteMany({ _id: { $in: old.map((t) => t._id) } })
	return old.length
}

async function main() {
	await mongoose.connection.asPromise()
	console.log(`Removed ${await cleanup()} incidents from earlier spike runs`)
	if (args.cleanup) return
	if (!args.resident || !args.admin || !PASSWORD) throw new Error('Usage: --resident=... --admin=... with PERF_PASSWORD set')

	const [resident, admin] = await Promise.all([login(args.resident), login(args.admin)])
	const services = (await Service.find({ teamId: { $nin: [null, ''] } }).select('name')).map((s) => s.name)
	const before = await Ticket.countDocuments()

	// Who is on call right now, and how many open incidents they already have
	const now = new Date()
	const shifts = await Shift.find({ start: { $lte: now }, end: { $gt: now } }).populate('team', 'name').populate('responder', 'name').populate('secondary', 'name')
	const onCall = new Map() // user id -> { name, team, role }
	for (const s of shifts) {
		if (s.responder) onCall.set(String(s.responder._id), { name: s.responder.name, team: s.team.name, role: 'primary' })
		if (s.secondary) onCall.set(String(s.secondary._id), { name: s.secondary.name, team: s.team.name, role: 'secondary' })
	}
	const load = async (id) => Ticket.countDocuments({ assignedTo: id, status: { $in: ACTIVE_STATUSES } })
	const startLoad = new Map(await Promise.all([...onCall.keys()].map(async (id) => [id, await load(id)])))
	const room = [...startLoad.values()].reduce((sum, n) => sum + Math.max(0, MAX_ACTIVE - n), 0)
	console.log(`${services.length} team-owned services, ${before} incidents in the database, ${onCall.size} people on call with room for ${room} more incidents`)

	// Team Queue before the spike
	const queueBefore = []
	for (let i = 0; i < 5; i++) queueBefore.push(await loadQueue(admin))

	// The admin keeps loading the Team Queue during the spike (50 ms between loads)
	let spiking = true
	const queueDuring = []
	const poller = (async () => { while (spiking) { queueDuring.push(await loadQueue(admin)); await sleep(50) } })()

	const t0 = performance.now()
	const sends = []
	const requests = Array.from({ length: COUNT }, (_, i) => new Promise((resolve) => setTimeout(async () => {
		const sent = performance.now()
		sends.push(sent - t0)
		const body = { title: `SPIKE-${String(i + 1).padStart(3, '0')} Power out in unit`, description: 'Spike test', service: services[i % services.length], severity: 1 + (i % 4), unit: String(100 + i), type: services[i % services.length] }
		try {
			const res = await fetch(`${API}/tickets/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resident}` }, body: JSON.stringify(body) })
			const data = await res.json()
			resolve({ ok: res.ok, status: res.status, data, ms: performance.now() - sent, done: performance.now() - t0 })
		} catch (err) {
			resolve({ ok: false, status: 0, error: err.message, ms: performance.now() - sent, done: performance.now() - t0 })
		}
	}, i * GAP)))
	const results = await Promise.all(requests)
	spiking = false
	await poller
	await sleep(1000) // notifications and request timings are saved just after each response

	// Checks
	const ok = results.filter((r) => r.ok)
	const ids = ok.map((r) => r.data.ticket._id)
	const saved = await Ticket.find({ _id: { $in: ids } }).select('assignedTo service events')
	const assigned = saved.filter((t) => t.assignedTo)
	const wrongPerson = assigned.filter((t) => !onCall.has(String(t.assignedTo)))
	const badTimeline = saved.filter((t) => t.events.length !== 2)
	const capReason = ok.filter((r) => !r.data.assignment.to && /open incidents/.test(r.data.assignment.reason ?? ''))
	const otherReason = ok.filter((r) => !r.data.assignment.to && !/open incidents/.test(r.data.assignment.reason ?? ''))
	const notes = await Notification.aggregate([{ $match: { ticket: { $in: saved.map((t) => t._id) } } }, { $group: { _id: '$ticket', n: { $sum: 1 } } }])
	const notesBy = new Map(notes.map((n) => [String(n._id), n.n]))
	const badNotes = saved.filter((t) => (notesBy.get(String(t._id)) ?? 0) !== (t.assignedTo ? 1 : 0))
	const overCap = []
	for (const [id, person] of onCall) {
		const n = await load(id)
		if (n > MAX_ACTIVE) overCap.push(`${person.name} (${person.team} ${person.role}) has ${n}`)
	}

	const ms = results.map((r) => r.ms)
	const summary = {
		succeeded: `${ok.length} / ${COUNT}`,
		errors: results.filter((r) => !r.ok).map((r) => r.status || r.error),
		sentAllMs: round(Math.max(...sends)),
		lastFinishedMs: round(Math.max(...results.map((r) => r.done))),
		fastestMs: round(Math.min(...ms)),
		medianMs: round(pct(ms, 50)),
		averageMs: round(avg(ms)),
		p95Ms: round(pct(ms, 95)),
		slowestMs: round(Math.max(...ms)),
		withinTarget: `${ms.filter((m) => m <= TARGET_MS).length} / ${COUNT}`,
		throughputPerSec: round(COUNT / (Math.max(...results.map((r) => r.done)) / 1000)),
		savedInDb: `${(await Ticket.countDocuments()) - before} / ${COUNT}`,
		roomBefore: room,
		autoAssigned: assigned.length,
		waitingAtCapacity: capReason.length,
		unassignedOtherReason: otherReason.length,
		assignedToSomeoneNotOnCall: wrongPerson.length,
		overThreeOpen: overCap,
		wrongTimeline: badTimeline.length,
		wrongNotifications: badNotes.length,
		queueBeforeAvgMs: round(avg(queueBefore)),
		queueDuringAvgMs: round(avg(queueDuring)),
		queueDuringSlowestMs: round(Math.max(...queueDuring)),
		queueLoadsDuring: queueDuring.length,
	}
	if (args['query-log']) {
		// Database operations behind one submission, measured on a single extra incident
		const from = Date.now()
		await fetch(`${API}/tickets/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resident}` }, body: JSON.stringify({ title: 'SPIKE-999 Query count', description: 'Spike test', service: services[0], severity: 1, unit: '999', type: services[0] }) })
		await sleep(1000)
		const ops = fs.readFileSync(args['query-log'], 'utf8').trim().split('\n').map((l) => l.split(' '))
			.filter(([t, , coll]) => Number(t) >= from && !['heartbeats', 'escalationpolicies'].includes(coll))
		const writes = ops.filter(([, cmd]) => ['insert', 'update', 'delete', 'findAndModify'].includes(cmd))
		summary.dbOpsPerIncident = `${ops.length - writes.length} reads + ${writes.length} writes`
		summary.dbOpsDetail = ops.map(([, cmd, coll]) => `${cmd} ${coll}`)
	}
	console.log(JSON.stringify(summary, null, 2))
	console.log(`RESULT ${JSON.stringify(summary)}`)
	const passed = !summary.errors.length && summary.savedInDb === `${COUNT} / ${COUNT}` && !wrongPerson.length && !overCap.length
		&& !badTimeline.length && !badNotes.length && !otherReason.length && assigned.length === Math.min(room, COUNT)
		&& pct(ms, 95) <= TARGET_MS
	console.log(passed ? 'PASSED' : 'FAILED')
	if (!passed) process.exitCode = 1
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => mongoose.disconnect())
