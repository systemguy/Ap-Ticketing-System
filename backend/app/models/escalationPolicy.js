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
//   person   a specific person on the team, its lead, or an admin
const LevelSchema = new mongoose.Schema({
	assignTo: { type: String, enum: ['on-call', 'lead', 'person'], required: true },
	person: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
	after: { type: AfterSchema, required: true },
}, { _id: false })

// A team's escalation policy. One per team; teams without one never escalate.
//
// Level 1 is the first person the ticket escalates to. The on-call solver gets it first.
// Example (HVAC):
//   filed    -> on-call solver
//   level 1  -> Bob, after 5 min
//   level 2  -> team lead Amy, 5 min later
//   final    -> 10 min later: unassigned, pinned for the team, lead and admins notified
const EscalationPolicySchema = new mongoose.Schema({
	team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, unique: true },
	enabled: { type: Boolean, default: true },
	levels: { type: [LevelSchema], default: [] },
	// How long the last level gets before the final step
	finalAfter: { type: AfterSchema, required: false },
	// When escalation was turned on. Older tickets count from here, so turning it on doesn't
	// escalate all of them at once.
	enabledAt: { type: Date },
	updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

module.exports = mongoose.model('EscalationPolicy', EscalationPolicySchema)
