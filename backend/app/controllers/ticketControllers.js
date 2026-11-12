const express = require('express')
const { isValidObjectId } = require('mongoose')
const Ticket = require('../models/tickets')
const user = require('../models/user')
const Team = require('../models/team')
const Service = require('../models/services')
const authMiddleware =  require('../middleware/authMiddleWare')
const {
	NEXT_STATUSES, STATUS_DATES, ACTIVE_STATUSES,
	isTicketOwner, isValidSeverity, ticketAccess, teamsLedBy, ticketTeam,
} = require('../helpers/tickets')
const { whoIsOnCall } = require('../helpers/shifts')
const { notifyAssigned, notifyReporter } = require('../helpers/notify')

// Photos come in as image data URLs
const PHOTO_FORMAT = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/
const PHOTO_MAX = 3 * 1024 * 1024

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

const QUEUE_ORDER = {escalationExhaustedAt: -1, severity: -1, createdAt: 1}

// Tickets you filed, plus every ticket for your home team and any team you lead.
// Admins see every ticket. Final-step tickets come first, then most severe, then oldest.
router.get('/', async (req, res)=>{
	try{
	const {accountId, team} = req
	const me = await user.findById(accountId).select('role')
	if(me?.role === 'admin'){
		const tickets = await Ticket.find().select('-events').sort(QUEUE_ORDER).populate('userPosted', 'name email').populate('assignedTo', 'name email')
		return res.status(200).json({ tickets })
	}
	const myTeams = [...new Set([team, ...await teamsLedBy(accountId)])].filter(t => t && t !== 'user')
	const services = await Service.find({ teamId: {$in: myTeams} }).select('name');
	const serviceNames = services.map(service => service.name);
	const tickets = await Ticket.find({
					$or:[{userPosted: accountId},
					 {service: { $in: serviceNames }} ]
					}).select('-events').sort(QUEUE_ORDER).populate('userPosted', 'name email').populate('assignedTo', 'name email');
	return res.status(200).json({ tickets });
	}
	catch(err){
		console.log(err)
		return res.status(500).json({ error: 'Failed to fetch tickets' });
	}

})

// Create a ticket. It's assigned to whoever is on call for that service's team, and they get
// notified. If nobody is on call it stays unassigned, and the timeline says why.
router.post('/create', async(req, res)=>{
	try{
		const {title, description, service, severity, unit, userComment, type, photo} = req.body
		const serviceExists = typeof service === 'string' && await Service.findOne({name:service})
		if(!serviceExists){
			return res.status(400).json({error:"invalid service"})
		}
		if(!isValidSeverity(severity)){
			return res.status(400).json({error:"invalid severity"})
		}
		if(photo !== undefined && photo !== '' && (typeof photo !== 'string' || photo.length > PHOTO_MAX || !PHOTO_FORMAT.test(photo))){
			return res.status(400).json({error: 'Photo must be a PNG, JPEG, WebP or GIF image under 3 MB'})
		}
		const userPosted = req.accountId
		const createdAt = new Date()
		const status = "Open"
		// The first timeline entry records who filed the ticket
		const events = [{type: 'created', actor: userPosted, createdAt}]

		// Assign to whoever is on call
		const team = await ticketTeam({service})
		let assignee = null
		let reason = null
		if(!team){
			reason = `No team owns ${service} yet`
		}else{
			const result = await whoIsOnCall(team._id, createdAt)
			if(result.responder) assignee = result.responder
			else reason = NO_RESPONDER[result.reason](team.name)
		}
		events.push(assignee
			? {type: 'auto_assigned', to: assignee.name, createdAt}
			: {type: 'auto_assigned', comment: reason, createdAt})

		const ticket = await Ticket.create({
			userPosted, title, description, service, unit, severity, type: type || service, status, createdAt, userComment,
			resolved: false, events, assignedTo: assignee?._id, photo: photo || undefined,
		})
		if(assignee) await notifyAssigned(ticket, assignee._id, {how: 'on-call'})

		const {photo: _photo, ...plain} = ticket.toObject()
		return res.send({
			ticket: plain,
			assignment: assignee ? {to: {_id: assignee._id, name: assignee.name}, team: team.name} : {to: null, team: team?.name ?? null, reason},
		})
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
		const now = new Date()
		// type mirrors service because the model still requires it
		const set = {...changes, type: service}
		const update = {$set: set, $push: {events: {$each: [{type: 'edited', actor: req.accountId, fields, createdAt: now}]}}}
		// If the new service belongs to another team, hand the ticket to that team's on-call
		// person and restart escalation. Not allowed once a team has acknowledged it.
		const [oldTeam, newTeam] = await Promise.all([ticketTeam(ticket), ticketTeam({service})])
		let assignee = null
		if(String(oldTeam?._id ?? '') !== String(newTeam?._id ?? '')){
			if(ticket.status !== 'Open'){
				return res.status(409).send({error: `${oldTeam?.name ?? 'The team'} is already working on this ticket, so its service can't be moved to another team. Add a comment instead.`})
			}
			let reason = null
			if(!newTeam){
				reason = `No team owns ${service} yet`
			}else{
				const result = await whoIsOnCall(newTeam._id, now)
				if(result.responder) assignee = result.responder
				else reason = NO_RESPONDER[result.reason](newTeam.name)
			}
			Object.assign(set, {escalationLevel: 0, escalationClockAt: now})
			update.$unset = {escalationExhaustedAt: 1, ...(assignee ? {} : {assignedTo: 1})}
			if(assignee) set.assignedTo = assignee._id
			update.$push.events.$each.push(assignee
				? {type: 'auto_assigned', to: assignee.name, createdAt: now}
				: {type: 'auto_assigned', comment: reason, createdAt: now})
		}
		// Only save if nothing changed the ticket in the meantime
		const updated = await Ticket.findOneAndUpdate(
			{_id: ticket._id, status: ticket.status, escalationLevel: ticket.escalationLevel ? ticket.escalationLevel : {$in: [0, null]}},
			update,
			{returnDocument: 'after'})
		if(!updated){
			return res.status(409).send({error: 'Someone else just changed this ticket. Reload and try again.'})
		}
		if(assignee) await notifyAssigned(updated, assignee._id, {how: 'on-call'})
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
		const unset = {}
		if(STATUS_DATES[to]) update[STATUS_DATES[to]] = now
		// resolved is true for Resolved and Closed, false again if reopened
		update.resolved = to === 'Resolved' || to === 'Closed'
		// A reopened ticket starts its escalation policy again from level 1
		if(to === 'Open'){
			update.escalationLevel = 0
			update.escalationClockAt = now
			unset.escalationExhaustedAt = 1
		}
		// Acknowledging stops escalation and clears the final-step flag
		if(to === 'Acknowledged') unset.escalationExhaustedAt = 1
		const me = await user.findById(req.accountId).select('name')
		const events = [{type: 'status_change', actor: req.accountId, from, to, createdAt: now}]
		// Acknowledging a ticket assigns it to the solver who acknowledged it
		if(to === 'Acknowledged' && ticket.assignedTo?.toString() !== req.accountId){
			const previous = ticket.assignedTo ? await user.findById(ticket.assignedTo).select('name') : null
			update.assignedTo = req.accountId
			events.push({type: 'assignment_change', actor: req.accountId, from: previous?.name, to: me?.name, createdAt: now})
		}
		// Only save if nobody (including the escalation timer) changed the ticket in the meantime
		const match = {_id: ticket._id, status: from}
		if(from === 'Open'){
			match.assignedTo = ticket.assignedTo ?? null
			match.escalationLevel = ticket.escalationLevel ? ticket.escalationLevel : {$in: [0, null]}
		}
		const updated = await Ticket.findOneAndUpdate(
			match,
			{$set: update, ...(Object.keys(unset).length ? {$unset: unset} : {}), $push: {events: {$each: events}}},
			{returnDocument: 'after'})
		if(!updated){
			return res.status(409).send({error: 'Someone else just changed this ticket. Reload to see its current status.'})
		}
		// The reporter only hears about acknowledged and resolved
		if((to === 'Acknowledged' || to === 'Resolved') && !isTicketOwner(req.accountId, updated)){
			await notifyReporter(updated, updated.userPosted, to === 'Acknowledged' ? 'acknowledged' : 'resolved', me?.name)
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
			.select('+photo')
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
		const set = {assignedTo: target._id}
		const update = {$set: set, $push: {events: {type: 'assignment_change', actor: req.accountId, from: previous?.name, to: target.name, createdAt: now}}}
		// If it was at the final step, assigning it restarts escalation for the new person
		if(ticket.escalationExhaustedAt){
			set.escalationLevel = 0
			set.escalationClockAt = now
			update.$unset = {escalationExhaustedAt: 1}
		}
		// Matching on the old assignee makes this fail if someone else reassigned it first
		const updated = await Ticket.findOneAndUpdate(
			{_id: ticket._id, assignedTo: previous?._id ?? null, status: ticket.status},
			update,
			{returnDocument: 'after'})
		if(!updated){
			return res.status(409).send({error: 'Someone else just changed this ticket. Reload and try again.'})
		}
		await notifyAssigned(updated, target._id, {how: 'lead', by: me?.name})
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
