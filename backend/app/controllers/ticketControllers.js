const express = require('express')
const { isValidObjectId } = require('mongoose')
const Ticket = require('../models/tickets')
const user = require('../models/user')
const Team = require('../models/team')
const Service = require('../models/services')
const authMiddleware =  require('../middleware/authMiddleWare')
const {
	NEXT_STATUSES, STATUS_DATES, ACTIVE_STATUSES,
	isTicketOwner, isValidSeverity, ticketAccess, teamsLedBy,
} = require('../helpers/tickets')
const { whoIsOnCall } = require('../helpers/shifts')

const router = express.Router()
router.use(authMiddleware)

// Ids that can't exist get a clean 404 instead of a database error
router.param('ticketId', (req, res, next, id) =>
	isValidObjectId(id) ? next() : res.status(404).send({error: 'Ticket not found'}))

// Why nobody can take a ticket right now, in words a team lead can act on (see whoIsOnCall)
const NO_RESPONDER = {
	'no-schedule': (team) => `${team} has no on-call schedule yet`,
	'schedule-ended': (team) => `${team}'s on-call schedule has ended`,
	'not-covered': (team) => `Nobody is on call for ${team} right now`,
	'responder-inactive': (team) => `The person on call for ${team} has a deactivated account`,
}

// Tickets you filed, plus every ticket for your home team and any team you lead.
// Admins see every ticket.
router.get('/', async (req, res)=>{
	try{
	const {accountId, team} = req
	const me = await user.findById(accountId).select('role')
	if(me?.role === 'admin'){
		const tickets = await Ticket.find().select('-events').populate('userPosted', 'name email').populate('assignedTo', 'name email')
		return res.status(200).json({ tickets })
	}
	const myTeams = [...new Set([team, ...await teamsLedBy(accountId)])].filter(t => t && t !== 'user')
	const services = await Service.find({ teamId: {$in: myTeams} }).select('name');
	const serviceNames = services.map(service => service.name);
	const tickets = await Ticket.find({
					$or:[{userPosted: accountId},
					 {service: { $in: serviceNames }} ]
					}).select('-events').populate('userPosted', 'name email').populate('assignedTo', 'name email');
	return res.status(200).json({ tickets });
	}
	catch(err){
		console.log(err)
		return res.status(500).json({ error: 'Failed to fetch tickets' });
	}

})

router.post('/create', async(req, res)=>{
	try{
		const {title, description, service, severity, unit, userComment, type} = req.body
		const serviceExists = typeof service === 'string' && await Service.findOne({name:service})
		if(!serviceExists){
			return res.status(400).json({error:"invalid service"})
		}
		if(!isValidSeverity(severity)){
			return res.status(400).json({error:"invalid severity"})
		}
		const userPosted = req.accountId
		const createdAt = Date.now()
		const status = "Open"
		// The first timeline entry records who filed the ticket
		const events = [{type: 'created', actor: userPosted, createdAt}]
		const ticket = await Ticket.create({userPosted, title, description, service, unit, severity ,type,status, createdAt, userComment, resolved: false, events})
		
		return res.send({ticket})
	}catch(err){
		if(err.name === 'ValidationError'){
			return res.status(400).json({error: Object.values(err.errors).map(e => e.message)})
		}
		console.log(err)
		res.status(500).json({error: 'failed to create tickets'})
	}

})

// Only the person who filed a ticket can delete it
router.put('/delete/:ticketId', async(req, res) =>{
	try{
		const ticket = await Ticket.findById(req.params.ticketId)
		if(!ticket){
			return res.status(404).send({error: 'Ticket not found'})
		}
		if(!isTicketOwner(req.accountId, ticket)){
			return res.status(403).send({error: 'Only the person who filed this ticket can delete it'})
		}
		await ticket.deleteOne()
		return res.send({deleted: true, ticketId: ticket.id})
	}catch(err){
		console.log(err)
		res.status(500).json({error: 'failed to delete ticket'})
	}
})

// The reporter who filed a ticket edits its details. Solvers add notes instead
// (POST /tickets/:ticketId/comments), so neither side can change the other's words.
router.put('/edit/:ticketId', async(req, res) =>{
	try{
		const ticket = await Ticket.findById(req.params.ticketId)
		if(!ticket){
			return res.status(404).send({error: 'Ticket not found'})
		}
		if(!isTicketOwner(req.accountId, ticket)){
			return res.status(403).send({error: 'Only the person who filed this ticket can edit it'})
		}
		const {title, description, unit, severity, service} = req.body
		const blank = Object.entries({title, description, unit}).find(([, value]) => typeof value !== 'string' || !value.trim())
		if(blank){
			return res.status(400).send({error: `${blank[0]} is required`})
		}
		if(typeof service !== 'string' || !await Service.exists({name: service})){
			return res.status(400).send({error: 'invalid service'})
		}
		if(!isValidSeverity(severity)){
			return res.status(400).send({error: 'invalid severity'})
		}
		const changes = {title: title.trim(), description: description.trim(), unit: unit.trim(), service, severity: Number(severity)}
		const fields = Object.keys(changes).filter(key => String(changes[key]) !== String(ticket[key] ?? ''))
		if(!fields.length){
			return res.send(ticket)
		}
		// type mirrors service because the model still requires it
		const updated = await Ticket.findByIdAndUpdate(ticket._id,
			{$set: {...changes, type: service}, $push: {events: {type: 'edited', actor: req.accountId, fields}}},
			{returnDocument: 'after'})
		return res.send(updated)
	}catch(err){
		console.log(err)
		res.status(500).json({error: 'failed to update tickets'})
	}
})

// Solvers on the ticket's team (and its team lead) move it through the lifecycle (see NEXT_STATUSES).
// Body: { status } with the status to move to. Without it, the ticket moves one step forward.
router.put('/update/:ticketId', async(req, res) =>{
	try{
		const ticket = await Ticket.findById(req.params.ticketId)
		if(!ticket){
			return res.status(404).send({error: 'Ticket not found'})
		}
		const access = await ticketAccess(req, ticket)
		if(!access.solver && !access.lead && !access.admin){
			return res.status(403).send({error: `Only the team that handles ${ticket.service} can change this ticket's status`})
		}
		const from = ticket.status
		const allowed = NEXT_STATUSES[from] || []
		const to = req.body?.status ?? allowed[0]
		if(typeof to !== 'string' || !allowed.includes(to)){
			const reason = to === from ? `This ticket is already ${from}.` : `Can't move a ticket from ${from} to ${to}.`
			const options = allowed.length ? ` From ${from} it can only go to ${allowed.join(' or ')}.` : ''
			return res.status(409).send({error: reason + options})
		}
		const now = new Date()
		const update = {status: to}
		if(STATUS_DATES[to]) update[STATUS_DATES[to]] = now
		const events = [{type: 'status_change', actor: req.accountId, from, to, createdAt: now}]
		// Acknowledging a ticket assigns it to the solver who acknowledged it
		if(to === 'Acknowledged' && ticket.assignedTo?.toString() !== req.accountId){
			const [solver, previous] = await Promise.all([
				user.findById(req.accountId).select('name'),
				ticket.assignedTo ? user.findById(ticket.assignedTo).select('name') : null,
			])
			update.assignedTo = req.accountId
			events.push({type: 'assignment_change', actor: req.accountId, from: previous?.name, to: solver?.name, createdAt: now})
		}
		// Matching on the old status makes this fail if someone else changed the ticket first
		const updated = await Ticket.findOneAndUpdate(
			{_id: ticket._id, status: from},
			{$set: update, $push: {events: {$each: events}}},
			{returnDocument: 'after'})
		if(!updated){
			return res.status(409).send({error: 'Someone else just changed this ticket. Reload to see its current status.'})
		}
		return res.send({ticket: updated, message: `Status changed from ${from} to ${to}`})
	}catch(err){
		console.log(err)
		res.status(500).json({error: 'failed to update tickets'})
	}
})

// One ticket with its timeline, for whoever filed it and the team that handles it.
// role is how this user relates to the ticket; nextStatuses lists the moves they can make now.
router.get('/:ticketId', async(req, res) =>{
	try{
		const ticket = await Ticket.findById(req.params.ticketId)
			.populate('userPosted', 'name email')
			.populate('assignedTo', 'name email')
			.populate('events.actor', 'name')
		if(!ticket){
			return res.status(404).send({error: 'Ticket not found'})
		}
		const {owner, solver, lead, admin, team} = await ticketAccess(req, ticket)
		if(!owner && !solver && !lead && !admin){
			return res.status(403).send({error: "You don't have access to this ticket"})
		}
		const data = ticket.toObject()
		// Tickets filed before the timeline existed still show when they were filed
		if(!data.events.some(e => e.type === 'created')){
			data.events.unshift({_id: `${data._id}-created`, type: 'created', actor: data.userPosted, createdAt: data.createdAt})
		}
		const staff = solver || lead || admin
		// Team leads (and admins) see who is on call now, so they can reassign an active ticket to them
		let assignment = null
		if((lead || admin) && ACTIVE_STATUSES.includes(data.status)){
			if(!team){
				assignment = {canReassign: false, onCall: null, reason: `No team owns ${data.service}, so there's no one on call for it`}
			}else{
				const result = await whoIsOnCall(team._id)
				const onCall = result.responder ? {_id: result.responder._id, name: result.responder.name} : null
				const current = String(data.assignedTo?._id ?? '')
				assignment = {
					team: team.name,
					onCall,
					until: result.shift?.end ?? null,
					canReassign: Boolean(onCall) && String(onCall._id) !== current,
					reason: onCall
						? (String(onCall._id) === current ? `${onCall.name} is on call and already has this ticket` : null)
						: NO_RESPONDER[result.reason](team.name),
				}
			}
		}
		return res.send({
			ticket: data,
			role: owner && !staff ? 'reporter' : 'solver',
			isLead: lead || admin,
			nextStatuses: staff ? NEXT_STATUSES[data.status] || [] : [],
			assignment,
		})
	}catch(err){
		console.log(err)
		res.status(500).json({error: 'Failed to fetch ticket'})
	}
})

// Comments (from the reporter) and notes (from the ticket's team) go on the timeline.
// Both sides can read them, and nobody can edit them afterwards.
router.post('/:ticketId/comments', async(req, res) =>{
	try{
		const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
		if(!text){
			return res.status(400).send({error: 'Write a comment before posting'})
		}
		if(text.length > 1000){
			return res.status(400).send({error: 'Comments must be 1000 characters or fewer'})
		}
		const ticket = await Ticket.findById(req.params.ticketId)
		if(!ticket){
			return res.status(404).send({error: 'Ticket not found'})
		}
		const access = await ticketAccess(req, ticket)
		let type = null
		if(access.owner) type = 'comment'
		else if(access.solver || access.lead || access.admin) type = 'note'
		if(!type){
			return res.status(403).send({error: 'Only the reporter and the team handling this ticket can comment on it'})
		}
		await Ticket.updateOne({_id: ticket._id}, {$push: {events: {type, actor: req.accountId, comment: text}}})
		return res.status(201).send({type})
	}catch(err){
		console.log(err)
		res.status(500).json({error: 'failed to add comment'})
	}
})

// Manual reassignment (team lead of the ticket's team, or an admin). Body: { responderId } (optional).
// A ticket can only go to the person on call for its team right now: if Tim is on call, the lead
// can't give ticket #14 to Jane until Jane's shift starts. The status stays as it is.
// The timeline records when it happened, who did it, and the previous and new responder.
router.put('/:ticketId/assign', async(req, res) =>{
	try{
		const ticket = await Ticket.findById(req.params.ticketId).populate('assignedTo', 'name')
		if(!ticket){
			return res.status(404).send({error: 'Ticket not found'})
		}
		const {lead, admin, team} = await ticketAccess(req, ticket)
		if(!lead && !admin){
			return res.status(403).send({error: team
				? `Only ${team.name}'s team lead can reassign this ticket`
				: 'Only a team lead can reassign tickets'})
		}
		if(!ACTIVE_STATUSES.includes(ticket.status)){
			return res.status(409).send({error: `This ticket is ${ticket.status}. Only open tickets can be reassigned; reopen it first.`})
		}
		if(!team){
			return res.status(409).send({error: `No team owns ${ticket.service}, so there's no one on call to assign it to`})
		}
		const result = await whoIsOnCall(team._id)
		if(!result.responder){
			return res.status(409).send({error: `${NO_RESPONDER[result.reason](team.name)}, so this ticket can't be reassigned`})
		}
		const target = result.responder
		const wanted = req.body?.responderId
		if(wanted && String(wanted) !== String(target._id)){
			return res.status(409).send({error: `Only ${target.name} is on call for ${team.name} right now. Tickets can only go to the person on call.`})
		}
		const previous = ticket.assignedTo
		if(previous && String(previous._id) === String(target._id)){
			return res.status(409).send({error: `${target.name} already has this ticket`})
		}
		const me = await user.findById(req.accountId).select('name')
		const now = new Date()
		// Matching on the old assignee makes this fail if someone else reassigned it first
		const updated = await Ticket.findOneAndUpdate(
			{_id: ticket._id, assignedTo: previous?._id ?? null, status: ticket.status},
			{$set: {assignedTo: target._id}, $push: {events: {type: 'assignment_change', actor: req.accountId, from: previous?.name, to: target.name, createdAt: now}}},
			{returnDocument: 'after'})
		if(!updated){
			return res.status(409).send({error: 'Someone else just changed this ticket. Reload and try again.'})
		}
		return res.send({
			message: previous ? `Reassigned from ${previous.name} to ${target.name}` : `Assigned to ${target.name}`,
			assignedTo: {_id: target._id, name: target.name},
			by: me?.name,
			at: now,
		})
	}catch(err){
		console.log(err)
		res.status(500).json({error: 'Failed to reassign the ticket'})
	}
})

module.exports = app => app.use('/tickets', router )
