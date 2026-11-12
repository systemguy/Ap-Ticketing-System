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
//   person   one specific person: someone on the team, its lead, or an admin (building management)
const LevelSchema = new mongoose.Schema({
	assignTo: { type: String, enum: ['on-call', 'lead', 'person'], required: true },
	person: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
	after: { type: AfterSchema, required: true },
}, { _id: false })

// A team's escalation policy. One per team; teams without one never escalate.
//
// Tier 1 is the FIRST person a ticket is escalated TO, not the person it was first assigned to
// (that's whoever was on call when it was filed). The professor's HVAC example becomes:
//   filed -> the on-call solver (initial assignment, Sprint 3)
//   level 1: Bob            5 min after filing
//   level 2: team lead Amy  5 min after level 1
//   final:                  10 min after level 2 -> unassigned, pinned to the top of the team
//                           queue, team lead and admins (facility administration) notified
// The final step has a wait (how long the last level gets) but no person: it's the end of the
// chain, and the ticket stays there until someone acknowledges it.
const EscalationPolicySchema = new mongoose.Schema({
	team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, unique: true },
	enabled: { type: Boolean, default: true },
	levels: { type: [LevelSchema], default: [] },
	// How long the last level has before the ticket reaches the final escalation state.
	// Policies saved before this existed fall back to the last level's own time frame.
	finalAfter: { type: AfterSchema, required: false },
	// When escalation was last switched on (policy created or re-enabled). Tickets filed earlier
	// count from this moment, so saving a policy never fires a burst of overdue escalations.
	enabledAt: { type: Date },
	updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

module.exports = mongoose.model('EscalationPolicy', EscalationPolicySchema)
