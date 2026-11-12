const mongoose = require('../../database')

// Requirement change (Sprint 4): uptime and speed.
//
// RequestSample: how long one request took. source "server" is measured by the backend from the
// moment the request arrives until the response is sent; "client" is the full round trip the
// user waited for, measured in the browser and reported back. Kept for 30 days.
const RequestSampleSchema = new mongoose.Schema({
	op: { type: String, required: true }, // login, submit, resolve, analytics, other
	source: { type: String, enum: ['server', 'client'], required: true },
	method: String,
	path: String, // route pattern, e.g. /tickets/update/:id (no ids or query strings)
	status: Number,
	ms: { type: Number, required: true },
	account: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who reported a client timing
	at: { type: Date, default: Date.now },
})
RequestSampleSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 24 * 3600 })
RequestSampleSchema.index({ op: 1, source: 1, at: -1 })

// Heartbeat: one document per minute the server was up and could write to the database.
// A minute with no heartbeat is a minute nobody could use the system, so uptime is
// (minutes with a heartbeat) / (minutes since monitoring started), and the gaps are the outages.
// type "start" marks a server (re)start. Kept for 90 days.
const HeartbeatSchema = new mongoose.Schema({
	minute: { type: Date, required: true }, // the start of the minute (seconds and ms zeroed)
	type: { type: String, enum: ['beat', 'start'], default: 'beat' },
	at: { type: Date, default: Date.now },
})
HeartbeatSchema.index({ minute: 1, type: 1 }, { unique: true })
HeartbeatSchema.index({ at: 1 }, { expireAfterSeconds: 90 * 24 * 3600 })

module.exports = {
	RequestSample: mongoose.model('RequestSample', RequestSampleSchema),
	Heartbeat: mongoose.model('Heartbeat', HeartbeatSchema),
}
