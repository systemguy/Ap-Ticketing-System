// Incident lifecycle rules and access checks shared by the ticket and user routes
const Service = require('../models/services')
const Team = require('../models/team')
const User = require('../models/user')

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

// Statuses where the ticket is still being worked on (it can be assigned or reassigned)
const ACTIVE_STATUSES = ['Open', 'Acknowledged', 'Investigating']

// The team that owns a ticket's service, or null when no team owns it.
// Services store their team by name (Service.teamId holds the team's name).
async function ticketTeam(ticket) {
	const service = await Service.findOne({ name: ticket.service }).select('teamId')
	if (!service?.teamId) return null
	return Team.findOne({ name: service.teamId })
}

// How the logged-in user relates to a ticket. A team lead counts for every team they lead,
// even one that isn't their home team (Morgan's home team is HVAC but he also leads Plumbing).
async function ticketAccess(req, ticket) {
	const [me, team, solver] = await Promise.all([
		User.findById(req.accountId).select('role active'),
		ticketTeam(ticket),
		isTicketSolver(req.team, ticket),
	])
	const admin = me?.role === 'admin'
	const lead = Boolean(team?.lead) && String(team.lead) === String(req.accountId)
	return { owner: isTicketOwner(req.accountId, ticket), solver, lead, admin, team }
}

// Names of the teams a user leads ("who leads team X" is the lead field on the team)
async function teamsLedBy(accountId) {
	const teams = await Team.find({ lead: accountId }).select('name')
	return teams.map((t) => t.name)
}

module.exports = {
	NEXT_STATUSES, STATUS_DATES, ACTIVE_STATUSES,
	isTicketSolver, isTicketOwner, isValidSeverity, ticketTeam, ticketAccess, teamsLedBy,
}
