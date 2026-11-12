const mongoose = require('../../database')

// Requirement change: uptime and speed.
//
// RequestSample: how long one request took. "server" is measured in the backend, "client" is
// what the user waited in the browser. Deleted after 30 days.
const RequestSampleSchema = new mongoose.Schema({
	op: { type: String, required: true }, // login, submit, resolve, analytics, other
	source: { type: String, enum: ['server', 'client'], required: true },
	method: String,
	path: String, // e.g. /tickets/update/:id
	status: Number,
	ms: { type: Number, required: true },
	account: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who reported a client timing
	at: { type: Date, default: Date.now },
})
RequestSampleSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 24 * 3600 })
RequestSampleSchema.index({ op: 1, source: 1, at: -1 })

// Heartbeat: one per minute while the server and database are up. A minute without one counts
// as downtime. type "start" marks a server restart. Deleted after 90 days.
const HeartbeatSchema = new mongoose.Schema({
	minute: { type: Date, required: true }, // rounded down to the minute
	type: { type: String, enum: ['beat', 'start'], default: 'beat' },
	at: { type: Date, default: Date.now },
})
HeartbeatSchema.index({ minute: 1, type: 1 }, { unique: true })
HeartbeatSchema.index({ at: 1 }, { expireAfterSeconds: 90 * 24 * 3600 })

module.exports = {
	RequestSample: mongoose.model('RequestSample', RequestSampleSchema),
	Heartbeat: mongoose.model('Heartbeat', HeartbeatSchema),
}
