// Load test for the Team Queue (GET /tickets), the heaviest read in the app.
//
//   PERF_PASSWORD=... node scripts/load-test.js --api=http://localhost:3000 --email=admin@example.com
//
// Options
//   --runs=10                  timed requests (after one warm-up that isn't counted)
//   --query-log=/tmp/q.log     the backend's QUERY_LOG file (see count-queries.js); adds the
//                              number of database operations behind one request
//   --label=1000               name for this load level in the output
//
// Each time is what the browser waits: from sending the request until the whole response has
// been downloaded. Log in as an admin so every incident in the database is read.
const fs = require('fs')

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
	const [key, value] = a.replace(/^--/, '').split('=')
	return [key, value ?? true]
}))
const API = args.api ?? 'http://localhost:3000'
const RUNS = Number(args.runs ?? 10)
const PASSWORD = process.env.PERF_PASSWORD ?? process.env.SEED_PASSWORD
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (n) => Math.round(n * 10) / 10

async function queue(token) {
	const start = performance.now()
	const res = await fetch(`${API}/tickets`, { headers: { Authorization: `Bearer ${token}` } })
	const body = await res.arrayBuffer()
	const ms = performance.now() - start
	if (!res.ok) throw new Error(`GET /tickets returned ${res.status}`)
	return { ms, bytes: body.byteLength, count: JSON.parse(Buffer.from(body)).tickets.length }
}

// Database operations logged between `from` and now, without the heartbeat and escalation timers
function countQueries(file, from) {
	const ops = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
		.map((line) => line.split(' ')).filter(([t]) => Number(t) >= from)
		.filter(([, , coll]) => !['heartbeats', 'escalationpolicies'].includes(coll))
	const by = (names) => ops.filter(([, cmd]) => names.includes(cmd))
	const reads = by(['find', 'aggregate', 'count', 'countDocuments', 'distinct'])
	const more = by(['getMore'])
	const writes = by(['insert', 'update', 'delete', 'findAndModify'])
	const text = [`${reads.length} reads`, more.length && `${more.length} cursor batch${more.length > 1 ? 'es' : ''}`, `${writes.length} write${writes.length === 1 ? '' : 's'}`]
		.filter(Boolean).join(' + ')
	return { reads: reads.length, getMore: more.length, writes: writes.length, text, detail: ops.map(([, cmd, coll]) => `${cmd} ${coll}`) }
}

async function main() {
	if (!args.email || !PASSWORD) throw new Error('Usage: PERF_PASSWORD=... node scripts/load-test.js --email=admin@... [--api=...]')
	const login = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: args.email, password: PASSWORD }) })
	const { token, error } = await login.json()
	if (!token) throw new Error(`Login failed: ${error}`)

	const warm = await queue(token) // warm-up, not counted
	const times = []
	for (let i = 0; i < RUNS; i++) times.push((await queue(token)).ms)

	let queries = null
	if (args['query-log']) {
		await sleep(500) // let earlier requests finish saving their timings
		const from = Date.now()
		await queue(token)
		await sleep(500) // the request timing is saved just after the response is sent
		queries = countQueries(args['query-log'], from)
	}

	const result = {
		label: args.label ?? String(warm.count),
		incidents: warm.count,
		runs: RUNS,
		fastestMs: round(Math.min(...times)),
		averageMs: round(times.reduce((a, b) => a + b, 0) / times.length),
		slowestMs: round(Math.max(...times)),
		responseKB: round(warm.bytes / 1024),
		queries: queries?.text ?? null,
		queryDetail: queries?.detail ?? null,
		allMs: times.map(round),
	}
	console.log(`${result.label}: ${result.incidents} incidents, ${result.responseKB} KB`)
	console.log(`  fastest ${result.fastestMs} ms, average ${result.averageMs} ms, slowest ${result.slowestMs} ms (${RUNS} runs)`)
	if (queries) console.log(`  queries: ${queries.text}\n    ${queries.detail.join('\n    ')}`)
	console.log(`RESULT ${JSON.stringify(result)}`)
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 })
