const express = require('express')
const { isValidObjectId } = require('mongoose')
const Ticket = require('../models/tickets')
const user = require('../models/user')
const Team = require('../models/team')
const Service = require('../models/services')
const authMiddleware =  require('../middleware/authMiddleWare')
const { NEXT_STATUSES, STATUS_DATES, isTicketSolver, isTicketOwner, isValidSeverity } = require('../helpers/tickets')

const router = express.Router()
router.use(authMiddleware)

// Ids that can't exist get a clean 404 instead of a database error
router.param('ticketId', (req, res, next, id) =>
	isValidObjectId(id) ? next() : res.status(404).send({error: 'Ticket not found'}))


router.get('/', async (req, res)=>{
	try{
	const {accountId, team} = req
	const services = await Service.find({ teamId: team }).select('name');
	const serviceNames = services.map(service => service.name);
	console.log(serviceNames)
	console.log(services)
	const tickets = await Ticket.find({
					$or:[{userPosted: accountId},
					 {service: { $in: serviceNames }} ]
					}).select('-events').populate('userPosted', 'name email');
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

// Solvers on the ticket's team move it through the lifecycle (see NEXT_STATUSES).
// Body: { status } with the status to move to. Without it, the ticket moves one step forward.
router.put('/update/:ticketId', async(req, res) =>{
	try{
		const ticket = await Ticket.findById(req.params.ticketId)
		if(!ticket){
			return res.status(404).send({error: 'Ticket not found'})
		}
		if(!await isTicketSolver(req.team, ticket)){
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
		const owner = isTicketOwner(req.accountId, ticket)
		const solver = await isTicketSolver(req.team, ticket)
		if(!owner && !solver){
			return res.status(403).send({error: "You don't have access to this ticket"})
		}
		const data = ticket.toObject()
		// Tickets filed before the timeline existed still show when they were filed
		if(!data.events.some(e => e.type === 'created')){
			data.events.unshift({_id: `${data._id}-created`, type: 'created', actor: data.userPosted, createdAt: data.createdAt})
		}
		return res.send({
			ticket: data,
			role: owner ? 'reporter' : 'solver',
			nextStatuses: solver ? NEXT_STATUSES[data.status] || [] : [],
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
		let type = null
		if(isTicketOwner(req.accountId, ticket)) type = 'comment'
		else if(await isTicketSolver(req.team, ticket)) type = 'note'
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

module.exports = app => app.use('/tickets', router )
