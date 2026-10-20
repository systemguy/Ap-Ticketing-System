// Incident lifecycle rules and access checks shared by the ticket and user routes
const Service = require('../models/services')

// Legal status moves. Resolved and Closed tickets can be reopened (back to Open).
const NEXT_STATUSES = {
	Open: ['Acknowledged'],
	Acknowledged: ['Investigating'],
	Investigating: ['Resolved'],
	Resolved: ['Closed', 'Open'],
	Closed: ['Open'],
}

// Field that records when a ticket last entered each status
const STATUS_DATES = {
	Acknowledged: 'acknowledgedAt',
	Investigating: 'investigatingAt',
	Resolved: 'resolvedAt',
	Closed: 'closedAt',
}

// True when the user is on the team that handles the ticket's service.
// Reporters have no team (stored as "user"), so this is false for them.
async function isTicketSolver(team, ticket) {
	if (!team || team === 'user') return false
	return Boolean(await Service.exists({ teamId: team, name: ticket.service }))
}

// True when the logged-in user filed the ticket (userPosted may be populated or a plain id)
function isTicketOwner(accountId, ticket) {
	const owner = ticket.userPosted?._id ?? ticket.userPosted
	return Boolean(owner) && owner.toString() === accountId
}

// Severity is a whole number from 1 (Low) to 4 (Critical)
function isValidSeverity(value) {
	const n = Number(value)
	return Number.isInteger(n) && n >= 1 && n <= 4
}

module.exports = { NEXT_STATUSES, STATUS_DATES, isTicketSolver, isTicketOwner, isValidSeverity }
