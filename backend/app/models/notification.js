const mongoose = require('../../database')

// A notification shown in the app. The same message is also emailed, and `email` tracks
// whether that worked.
// Types: assigned (solver got a ticket), final (ticket hit the final escalation step),
// acknowledged and resolved (for the reporter).
const NotificationSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
	type: { type: String, enum: ['assigned', 'final', 'acknowledged', 'resolved'], required: true },
	title: { type: String, required: true },
	message: { type: String, required: true },
	// Ticket details shown in the notification
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
