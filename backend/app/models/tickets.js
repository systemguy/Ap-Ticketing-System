const mongoose = require('../../database')


// Timeline entries the backend writes by itself (no person did them)
const SYSTEM_EVENTS = ['auto_assigned', 'escalated', 'final_escalation']

// One timeline entry. Only the backend writes these, and nobody can edit them.
const EventSchema = new mongoose.Schema({
	// created, status_change, assignment_change, edited, comment (reporter), note (solver),
	// or one the system writes on its own, so it has no actor:
	//   auto_assigned     given to whoever was on call when it was filed
	//   escalated         moved up a level by the escalation timer
	//   final_escalation  went through every level unacknowledged (now unassigned and pinned)
	type: { type: String, required: true },
	actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: function () { return !SYSTEM_EVENTS.includes(this.type) } },
	from: String, // previous status, or previous assignee's name
	to: String, // new status, or new assignee's name
	fields: { type: [String], default: undefined }, // edited: which details changed
	level: Number, // escalated: the level the ticket moved to (1 is the first escalation)
	skipped: Boolean, // escalated: this level was passed straight through while catching up (its person wasn't notified)
	comment: String, // comment or note text; for escalated, why nobody new got the ticket
	createdAt: { type: Date, default: Date.now },
})

const TicketScheme= new mongoose.Schema({
	ticketId:{
		type: String,
		required: false,
		select: true,
	},
	userPosted:{
		type:mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
		select: true
	},
	title:{
		type: String,
		required: true,
		select: true
	},
	type:{
		type:String,
		required: true,
		select: true
	},
	description:{
		type: String,
		required: true,
		select: true
	},
	userComment:{
		type: String,
		required: false,
		select: true
	},
	solverComment:{
		type: String,
		required: false,
		select: true
	},
	severity:{
		type: Number,
		required: true,
		select: true
	},
	service: {
		type: String,
		ref: 'Service',
		required: true,
		select: true
	},
	status:{
		type: String,
		required: true,
		select: true
	},
	createdAt:{
		type: Date,
		required: true,
		select: true
	},
	acknowledgedAt:{
		type: Date,
		required:false,
		select: true
	},
	investigatingAt:{
		type: Date,
		required: false,
		select: true
	},
	resolvedAt:{
		type: Date,
		required: false,
		select: true
	},
	closedAt:{
		type: Date,
		required: false,
		select: true
	},
	unit:{
		type:String,
		required:  true,
		select: true
	},
	resolved:{
		type: Boolean,
		required: false,
		select: true
	},
	// Solver who acknowledged the ticket
	assignedTo:{
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false,
		select: true
	},
	// Escalation: how many levels of the team's policy this ticket has gone through, and when
	// the current level's clock started (empty means it started when the ticket was filed).
	// Both reset when the ticket is reopened.
	escalationLevel:{
		type: Number,
		default: 0,
		select: true
	},
	escalationClockAt:{
		type: Date,
		required: false,
		select: true
	},
	// Set when the ticket went through every escalation level without being acknowledged.
	// While set, the ticket is unassigned and pinned to the top of its team's queue.
	// Cleared when someone acknowledges it or it is reopened.
	escalationExhaustedAt:{
		type: Date,
		required: false,
		select: true
	},
	// Optional photo from the reporter, as a compressed image data URL (see TicketForm.jsx).
	// Left out of lists (select: false); the single-ticket route asks for it.
	photo:{
		type: String,
		required: false,
		select: false,
		maxlength: [3 * 1024 * 1024, 'Photo is too large'],
	},
	// The ticket's timeline: who did what and when, oldest first
	events: [EventSchema]

})


const ticket = mongoose.model('Ticket', TicketScheme)

module.exports = ticket
module.exports.SYSTEM_EVENTS = SYSTEM_EVENTS
