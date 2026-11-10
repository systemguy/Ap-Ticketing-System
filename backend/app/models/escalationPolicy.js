const mongoose = require('../../database')

// How long a ticket can sit unacknowledged at one level before it moves to the next,
// in minutes, for each severity (1 Low, 2 Moderate, 3 High, 4 Critical).
const AfterSchema = new mongoose.Schema({
	low: { type: Number, required: true },
	moderate: { type: Number, required: true },
	high: { type: Number, required: true },
	critical: { type: Number, required: true },
}, { _id: false })

// One step of the chain: who gets the ticket when it escalates to this level.
//   on-call  whoever is on call for the team at that moment
//   lead     the team's lead
//   person   one specific person (a responder or an admin, e.g. building management)
const LevelSchema = new mongoose.Schema({
	assignTo: { type: String, enum: ['on-call', 'lead', 'person'], required: true },
	person: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
	after: { type: AfterSchema, required: true },
}, { _id: false })

// A team's escalation policy. One per team; teams without one never escalate.
const EscalationPolicySchema = new mongoose.Schema({
	team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, unique: true },
	enabled: { type: Boolean, default: true },
	levels: { type: [LevelSchema], default: [] },
	updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

module.exports = mongoose.model('EscalationPolicy', EscalationPolicySchema)
