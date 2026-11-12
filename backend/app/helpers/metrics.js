// Requirement change: uptime and speed.
//
//   - Every request is timed. Log in, submitting, resolving and the analytics page each get
//     their own label.
//   - The browser also reports how long the user actually waited.
//   - A heartbeat is saved every 30 seconds. Minutes without one count as downtime.
//   - GET /health tells you if the server and database are up (no login needed).
//
// summary() builds everything the Performance page shows.
const mongoose = require('../../database')
const { RequestSample, Heartbeat } = require('../models/metrics')
const Ticket = require('../models/tickets')

// Our targets. p95 means 95% of requests are this fast or faster.
const TARGETS = {
	uptimePercent: 99, // about 14 minutes of downtime a day at most
	// server = time in the backend, client = what the user waited
	speed: {
		login: { label: 'Log in', server: 1000, client: 2000 },
		submit: { label: 'Incident submission', server: 1000, client: 2000 },
		resolve: { label: 'Incident resolution (marking it resolved)', server: 1000, client: 2000 },
		analytics: { label: 'Analytics update (this page)', server: 2000, client: 3000 },
	},
	analyticsRefreshSeconds: 30, // how often the Performance page refreshes
	// Targets for handling incidents, by severity, in minutes
	incidents: {
		4: { acknowledge: 15, resolve: 4 * 60 },
		3: { acknowledge: 30, resolve: 24 * 60 },
		2: { acknowledge: 120, resolve: 3 * 24 * 60 },
		1: { acknowledge: 480, resolve: 7 * 24 * 60 },
	},
}
const OPS = Object.keys(TARGETS.speed)
const WINDOWS = { '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3, '30d': 30 * 24 * 3600e3 }

const startedAt = new Date()

// Which of our named operations a request was
function classify(method, path, body) {
	if (method === 'POST' && (path === '/login' || path === '/login/')) return 'login'
	if (method === 'POST' && path === '/tickets/create') return 'submit'
	if (method === 'PUT' && path === '/tickets/update/:ticketId' && body?.status === 'Resolved') return 'resolve'
	if (method === 'GET' && path === '/metrics/summary') return 'analytics'
	return 'other'
}

// Times every request and saves the result
function recordRequests(req, res, next) {
	if (req.method === 'OPTIONS' || req.path === '/health') return next()
	const start = process.hrtime.bigint()
	res.on('finish', () => {
		const ms = Number(process.hrtime.bigint() - start) / 1e6
		// The route pattern, without ids
		const path = req.route ? `${req.baseUrl}${req.route.path}` : null
		// Skip 404s and 401s, they're not real usage
		if (!path || res.statusCode === 401 || res.statusCode === 404) return
		const op = classify(req.method, path, req.body)
		RequestSample.create({ op, source: 'server', method: req.method, path, status: res.statusCode, ms: Math.round(ms * 10) / 10 })
			.catch(() => { /* metrics must never break a request */ })
	})
	return next()
}

const floorMinute = (d) => new Date(Math.floor(d.getTime() / 60000) * 60000)

// Saves this minute's heartbeat. If the database is down this fails and leaves a gap.
async function beat(type = 'beat') {
	const now = new Date()
	await Heartbeat.updateOne({ minute: floorMinute(now), type }, { $setOnInsert: { at: now } }, { upsert: true })
}

function startHeartbeat() {
	const run = (type) => beat(type).catch((err) => console.error('[uptime] heartbeat failed:', err.message))
	// Once the database is connected, mark the start and keep beating
	mongoose.connection.asPromise().then(() => { run('start'); run('beat') }).catch(() => {})
	return setInterval(() => run('beat'), 30 * 1000)
}

// For GET /health
function health() {
	const db = mongoose.connection.readyState === 1
	return {
		status: db ? 'ok' : 'degraded',
		database: db ? 'connected' : 'disconnected',
		uptimeSeconds: Math.round(process.uptime()),
		startedAt,
		time: new Date(),
	}
}

// count, average, p50, p95, max and errors for a list of timings
function stats(samples) {
	if (!samples.length) return { count: 0, avg: null, p50: null, p95: null, max: null, errors: 0 }
	const ms = samples.map((s) => s.ms).sort((a, b) => a - b)
	const pick = (p) => ms[Math.min(ms.length - 1, Math.ceil(p * ms.length) - 1)]
	const round = (n) => Math.round(n)
	return {
		count: ms.length,
		avg: round(ms.reduce((a, b) => a + b, 0) / ms.length),
		p50: round(pick(0.5)),
		p95: round(pick(0.95)),
		max: round(ms[ms.length - 1]),
		errors: samples.filter((s) => s.status >= 500).length,
	}
}

async function uptime(now, since) {
	const first = await Heartbeat.findOne().sort({ minute: 1 }).select('minute')
	if (!first) return { percent: null, upMinutes: 0, totalMinutes: 0, monitoredSince: null, downtimes: [], restarts: [] }
	const start = first.minute > since ? first.minute : floorMinute(since)
	// Only count finished minutes
	const end = new Date(Math.max(start.getTime(), floorMinute(now).getTime() - 60000))
	const [beats, starts] = await Promise.all([
		Heartbeat.find({ type: 'beat', minute: { $gte: start, $lte: end } }).select('minute').sort({ minute: 1 }).lean(),
		Heartbeat.find({ type: 'start', minute: { $gte: start, $lte: now } }).select('minute').sort({ minute: 1 }).lean(),
	])
	const totalMinutes = Math.round((end - start) / 60000) + 1
	const upMinutes = Math.min(totalMinutes, beats.length)
	// Two or more missing minutes in a row = an outage
	const downtimes = []
	let prev = start.getTime() - 60000
	for (const b of beats) {
		const t = new Date(b.minute).getTime()
		const missing = Math.round((t - prev) / 60000) - 1
		if (missing >= 2) downtimes.push({ from: new Date(prev + 60000), to: new Date(t), minutes: missing })
		prev = t
	}
	return {
		percent: Math.round((upMinutes / totalMinutes) * 100000) / 1000,
		upMinutes,
		totalMinutes,
		downMinutes: totalMinutes - upMinutes,
		monitoredSince: first.minute,
		downtimes: downtimes.reverse().slice(0, 20),
		restarts: starts.map((s) => s.minute).reverse().slice(0, 20),
	}
}

async function incidentSpeed(since) {
	const tickets = await Ticket.find({ createdAt: { $gte: since } })
		.select('severity status createdAt acknowledgedAt resolvedAt escalationLevel escalationExhaustedAt').lean()
	const minutes = (a, b) => (new Date(b) - new Date(a)) / 60000
	const median = (xs) => {
		if (!xs.length) return null
		const s = [...xs].sort((a, b) => a - b)
		const m = Math.floor(s.length / 2)
		return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2)
	}
	const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
	return [4, 3, 2, 1].map((severity) => {
		const list = tickets.filter((t) => Number(t.severity) === severity)
		const ack = list.filter((t) => t.acknowledgedAt).map((t) => minutes(t.createdAt, t.acknowledgedAt)).filter((m) => m >= 0)
		const res = list.filter((t) => t.resolvedAt).map((t) => minutes(t.createdAt, t.resolvedAt)).filter((m) => m >= 0)
		const target = TARGETS.incidents[severity]
		return {
			severity,
			filed: list.length,
			acknowledged: ack.length,
			resolved: res.length,
			escalated: list.filter((t) => (t.escalationLevel || 0) > 0).length,
			reachedFinal: list.filter((t) => t.escalationExhaustedAt).length,
			acknowledgeMedian: median(ack),
			acknowledgeAvg: avg(ack),
			acknowledgeWithinTarget: ack.filter((m) => m <= target.acknowledge).length,
			resolveMedian: median(res),
			resolveAvg: avg(res),
			resolveWithinTarget: res.filter((m) => m <= target.resolve).length,
			target,
		}
	})
}

// Everything the Performance page shows, for the last 24 hours, 7 days or 30 days
async function summary(windowKey = '24h') {
	const t0 = process.hrtime.bigint()
	const now = new Date()
	const window = WINDOWS[windowKey] ? windowKey : '24h'
	const since = new Date(now - WINDOWS[window])
	// Read all the named operations; total everything else in the database
	const [up, samples, overallAgg, overallSample, incidents] = await Promise.all([
		uptime(now, since),
		RequestSample.find({ at: { $gte: since }, op: { $in: OPS } }).select('op source status ms').lean(),
		RequestSample.aggregate([
			{ $match: { at: { $gte: since }, source: 'server' } },
			{ $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$ms' }, max: { $max: '$ms' }, errors: { $sum: { $cond: [{ $gte: ['$status', 500] }, 1, 0] } } } },
		]),
		// p50/p95 for all traffic, from a random sample of up to 20,000 requests
		RequestSample.aggregate([{ $match: { at: { $gte: since }, source: 'server' } }, { $sample: { size: 20000 } }, { $project: { _id: 0, ms: 1, status: 1 } }]),
		incidentSpeed(since),
	])
	const speed = OPS.map((op) => ({
		op,
		label: TARGETS.speed[op].label,
		target: { server: TARGETS.speed[op].server, client: TARGETS.speed[op].client },
		server: stats(samples.filter((s) => s.op === op && s.source === 'server')),
		client: stats(samples.filter((s) => s.op === op && s.source === 'client')),
	}))
	const agg = overallAgg[0]
	const pct = stats(overallSample)
	const overall = agg
		? { count: agg.count, avg: Math.round(agg.avg), p50: pct.p50, p95: pct.p95, max: Math.round(agg.max), errors: agg.errors, errorRate: Math.round((agg.errors / agg.count) * 10000) / 100 }
		: { ...stats([]), errorRate: null }
	return {
		window,
		generatedAt: now,
		health: health(),
		targets: { uptimePercent: TARGETS.uptimePercent, analyticsRefreshSeconds: TARGETS.analyticsRefreshSeconds },
		uptime: up,
		speed,
		overall,
		incidents,
		computeMs: Math.round(Number(process.hrtime.bigint() - t0) / 1e6),
	}
}

module.exports = { TARGETS, OPS, WINDOWS, recordRequests, startHeartbeat, health, summary, classify }
