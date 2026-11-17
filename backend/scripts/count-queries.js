// Logs every MongoDB command the backend sends, so the load and spike tests can count the
// database operations behind one request. Works on Atlas too (where the profiler isn't allowed).
//
//   QUERY_LOG=/tmp/queries.log node --env-file=.env -r ./scripts/count-queries.js app.js
//
// Each line is: <time in ms> <command> <collection>
const fs = require('fs')
const mongoose = require('mongoose')

const LOG = process.env.QUERY_LOG
const SKIP = new Set(['hello', 'isMaster', 'ismaster', 'ping', 'endSessions', 'saslStart', 'saslContinue', 'buildInfo'])

if (LOG) {
	fs.writeFileSync(LOG, '')
	const connect = mongoose.connect.bind(mongoose)
	mongoose.connect = (uri, options = {}) => connect(uri, { ...options, monitorCommands: true })
	mongoose.connection.on('connected', () => {
		mongoose.connection.getClient().on('commandStarted', (e) => {
			if (SKIP.has(e.commandName)) return
			const collection = e.commandName === 'getMore' ? e.command.collection : e.command[e.commandName]
			fs.appendFileSync(LOG, `${Date.now()} ${e.commandName} ${collection}\n`)
		})
	})
}
