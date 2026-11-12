const mongoose = require('../../database')

// One in-app notification. The same message also goes out by email (see helpers/notify.js);
// `email` records what happened to that copy so a failed send is visible, not silent.
//   assigned      a solver was given a ticket (on-call auto-assignment, the team lead, or escalation)
//   final         a ticket went through every escalation level without being acknowledged
//   acknowledged  the reporter's ticket was acknowledged
//   resolved      the reporter's ticket was resolved
const NotificationSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
	type: { type: String, enum: ['assigned', 'final', 'acknowledged', 'resolved'], required: true },
	title: { type: String, required: true },
	message: { type: String, required: true },
	// What the solver needs at a glance: incident id, service, severity and the action needed
	ticketRef: String,
	service: String,
	severity: Number,
	action: String,
	read: { type: Boolean, default: false },
	readAt: Date,
	email: {
		status: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending' },
		to: String,
		error: String,
		sentAt: Date,
	},
}, { timestamps: true })

NotificationSchema.index({ user: 1, createdAt: -1 })
NotificationSchema.index({ user: 1, read: 1 })

module.exports = mongoose.model('Notification', NotificationSchema)
