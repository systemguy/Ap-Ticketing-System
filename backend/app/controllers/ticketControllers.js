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
const { onCallAssignee, withTeamLock, MAX_ACTIVE } = require('../helpers/shifts')
const { notifyAssigned, notifyReporter } = require('../helpers/notify')
const { NOT_DELETED } = require('../helpers/softDelete')
const { centralMoment, addDays } = require('../helpers/time')

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
	'at-capacity': (team) => `Everyone on call for ${team} already has ${MAX_ACTIVE} open incidents`,
}

// Timeline note when the secondary got the ticket because the primary was full
const viaSecondary = (result) => result.role === 'secondary'
	? `secondary on call (${result.loads.find(l => l.role === 'primary')?.name ?? 'the primary'} already has ${MAX_ACTIVE} open incidents)`
	: undefined

const QUEUE_ORDER = {escalationExhaustedAt: -1, severity: -1, createdAt: 1}

// Filters any list can use (Sprint 5, for the auditor view). All optional, combined with AND:
//   severity=3,4                    only these severities
//   team=HVAC,OIT                   only incidents for services these teams own
//   excludeTeam=OIT                 everything except these teams' services
//   service=ac repair               only these services
//   excludeService=network setup    everything except these services
//   from=2026-11-01&to=2026-11-30   filed on these days (Central time, both days included).
//                                   Full ISO times work too.
// Bad values get a 400, so a typo never silently shows the wrong list.
const csv = (v) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : [])
const DAY = /^\d{4}-\d{2}-\d{2}$/
// Start of a day (or of the next day, for an end date), or an exact ISO time
function boundary(value, end){
	if(DAY.test(value)) return centralMoment(end ? addDays(value, 1) : value, 0)
	const at = new Date(value)
	return Number.isNaN(+at) ? null : at
}
async function filtersFrom(query){
	const match = {}
	const severities = csv(query.severity).map(Number)
	if(severities.some((n) => !Number.isInteger(n) || n < 1 || n > 4)){
		return {error: 'severity must be numbers from 1 to 4, like severity=3,4'}
	}
	if(severities.length) match.severity = {$in: severities}
	// Teams own services by name. Deleted services still count, so old incidents stay findable.
	const teamServices = async (teams) => (await Service.find({teamId: {$in: teams}}).select('name')).map((x) => x.name)
	const rules = []
	if(csv(query.team).length) rules.push({service: {$in: await teamServices(csv(query.team))}})
	if(csv(query.excludeTeam).length) rules.push({service: {$nin: await teamServices(csv(query.excludeTeam))}})
	if(csv(query.service).length) rules.push({service: {$in: csv(query.service)}})
	if(csv(query.excludeService).length) rules.push({service: {$nin: csv(query.excludeService)}})
	if(rules.length) match.$and = rules
	if(query.from || query.to){
		const from = query.from ? boundary(String(query.from), false) : null
		const to = query.to ? boundary(String(query.to), true) : null
		if((query.from && !from) || (query.to && !to)){
			return {error: 'from and to must be dates like 2026-11-01'}
		}
		if(from && to && from >= to){
			return {error: 'from must be before to'}
		}
		match.createdAt = {}
		if(from) match.createdAt.$gte = from
		if(to) match.createdAt[DAY.test(String(query.to)) ? '$lt' : '$lte'] = to
	}
	return {match}
}

// Tickets you filed, plus every ticket for your home team and any team you lead.
// Admins and auditors see every ticket. Final-step tickets come first, then most severe, then oldest.
// Deleted tickets are left out, except for auditors (who see everything, all time, each marked
// active: false) and admins who ask for them with includeDeleted=1.
router.get('/', async (req, res)=>{
	try{
	const {accountId, team} = req
	const me = await user.findById(accountId).select('role')
	const filters = await filtersFrom(req.query)
	if(filters.error){
		return res.status(400).json({error: filters.error})
	}
	const showDeleted = me?.role === 'auditor' || (me?.role === 'admin' && ['1', 'true'].includes(String(req.query.includeDeleted)))
	const base = {...filters.match, ...(showDeleted ? {} : NOT_DELETED)}
	if(me?.role === 'admin' || me?.role === 'auditor'){
		const tickets = await Ticket.find(base).select('-events').sort(QUEUE_ORDER).populate('userPosted', 'name email').populate('assignedTo', 'name email')
		return res.status(200).json({ tickets })
	}
	const myTeams = [...new Set([team, ...await teamsLedBy(accountId)])].filter(t => t && t !== 'user')
	const services = await Service.find({ teamId: {$in: myTeams} }).select('name');
	const serviceNames = services.map(service => service.name);
	const tickets = await Ticket.find({
					...base,
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
		// Deleted services (and services of deleted teams) can't get new incidents
		if(serviceExists.active === false || (serviceExists.teamId && !await Team.exists({name: serviceExists.teamId, ...NOT_DELETED}))){
			return res.status(400).json({error: `"${service}" is no longer offered. Pick another service.`})
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

		// Assign to whoever is on call. Picking them and saving the ticket happen under the team's
		// lock, so a burst of new tickets can't push anyone past MAX_ACTIVE.
		const team = await ticketTeam({service})
		let assignee = null
		let reason = null
		const save = () => {
			events.push(assignee
				? {type: 'auto_assigned', to: assignee.name, comment: reason, createdAt}
				: {type: 'auto_assigned', comment: reason, createdAt})
			return Ticket.create({
				userPosted, title, description, service, unit, severity, type: type || service, status, createdAt, userComment,
				resolved: false, events, assignedTo: assignee?._id, photo: photo || undefined,
			})
		}
		let ticket
		if(!team){
			reason = `No team owns ${service} yet`
			ticket = await save()
		}else{
			ticket = await withTeamLock(team._id, async () => {
				const result = await onCallAssignee(team._id, createdAt)
				if(result.responder){
					assignee = result.responder
					reason = viaSecondary(result)
				}else reason = NO_RESPONDER[result.reason](team.name)
				return save()
			})
		}
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
		if(!ticket || ticket.active === false){
			return res.status(404).send({error: 'Ticket not found'})
		}
		if(!isTicketOwner(req.accountId, ticket)){
			return res.status(403).send({error: 'Only the person who filed this ticket can delete it'})
		}
		// Soft delete: it leaves every list but stays in history (auditors and analytics still see it)
		const update = Ticket.deletionUpdate(req.accountId, true)
		update.$push.events = {type: 'deleted', actor: req.accountId, createdAt: update.$set.deletedAt}
		await Ticket.updateOne({_id: ticket._id}, update)
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
		if(!ticket || ticket.active === false){
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
		if(service !== ticket.service && !await Service.exists({name: service, ...NOT_DELETED})){
			return res.status(400).send({error: `"${service}" is no longer offered. Pick another service.`})
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
		const moving = String(oldTeam?._id ?? '') !== String(newTeam?._id ?? '')
		if(moving && ticket.status !== 'Open'){
			return res.status(409).send({error: `${oldTeam?.name ?? 'The team'} is already working on this ticket, so its service can't be moved to another team. Add a comment instead.`})
		}
		const save = async () => {
			if(moving){
				let reason = null
				if(!newTeam){
					reason = `No team owns ${service} yet`
				}else{
					const result = await onCallAssignee(newTeam._id, now)
					if(result.responder){
						assignee = result.responder
						reason = viaSecondary(result)
					}else reason = NO_RESPONDER[result.reason](newTeam.name)
				}
				Object.assign(set, {escalationLevel: 0, escalationClockAt: now})
				update.$unset = {escalationExhaustedAt: 1, ...(assignee ? {} : {assignedTo: 1})}
				if(assignee) set.assignedTo = assignee._id
				update.$push.events.$each.push(assignee
					? {type: 'auto_assigned', to: assignee.name, comment: reason, createdAt: now}
					: {type: 'auto_assigned', comment: reason, createdAt: now})
			}
			// Only save if nothing changed the ticket in the meantime
			return Ticket.findOneAndUpdate(
				{_id: ticket._id, status: ticket.status, escalationLevel: ticket.escalationLevel ? ticket.escalationLevel : {$in: [0, null]}},
				update,
				{returnDocument: 'after'})
		}
		// Moving to another team picks its on-call person, so it waits for that team's lock
		const updated = moving && newTeam ? await withTeamLock(newTeam._id, save) : await save()
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
		if(!ticket || ticket.active === false){
			return res.status(404).send({error: 'Ticket not found'})
		}
		const access = await ticketAccess(req, ticket)
		if(!access.solver && !access.lead && !access.admin){
			return res.status(403).send({error: `Only the team that handles ${ticket.service} can change this ticket's status`})
		}
		const from = ticket.status
		// Anyone on the team can acknowledge an Open ticket (that's how they take it). After that,
		// only the person who has it, the team lead or an admin can move it along.
		const holder = ticket.assignedTo ? String(ticket.assignedTo) : null
		if(from !== 'Open' && !access.lead && !access.admin && holder !== String(req.accountId)){
			const owner = holder ? await user.findById(holder).select('name') : null
			return res.status(403).send({error: `${owner?.name ?? 'Someone else'} has this ticket. Only they, the team lead or an admin can change its status.`})
		}
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
			.populate('deletedBy', 'name')
		if(!ticket){
			return res.status(404).send({error: 'Ticket not found'})
		}
		const access = await ticketAccess(req, ticket)
		// Auditors read every ticket (and its whole timeline) but can't change anything
		const {owner, auditor} = access
		// Admins and auditors still see deleted tickets; for everyone else they're gone
		if(ticket.active === false && !access.admin && !auditor){
			return res.status(404).send({error: 'Ticket not found'})
		}
		if(!owner && !access.solver && !access.lead && !access.admin && !auditor){
			return res.status(403).send({error: "You don't have access to this ticket"})
		}
		// Nobody works a deleted ticket, so it's read-only for everyone
		const live = ticket.active !== false
		const solver = access.solver && live, lead = access.lead && live, admin = access.admin && live
		const team = access.team
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
				const result = await onCallAssignee(team._id)
				const current = String(data.assignedTo?._id ?? '')
				const primary = result.loads.find(l => l.role === 'primary') ?? null
				const secondary = result.loads.find(l => l.role === 'secondary') ?? null
				// Who the lead can give it to: someone on call with room, who doesn't already have it
				const target = result.loads.find(l => l.load < MAX_ACTIVE && String(l._id) !== current) ?? null
				const holderOnCall = result.loads.find(l => String(l._id) === current)
				assignment = {
					team: team.name,
					onCall: target ? {_id: target._id, name: target.name, role: target.role} : null,
					primary, secondary, max: MAX_ACTIVE,
					until: result.shift?.end ?? null,
					canReassign: Boolean(target),
					reason: target ? null
						: holderOnCall ? `${holderOnCall.name} is on call and already has this ticket`
						: result.loads.length ? NO_RESPONDER['at-capacity'](team.name)
						: NO_RESPONDER[result.reason](team.name),
				}
			}
		}
		return res.send({
			ticket: data,
			role: auditor && !staff && !owner ? 'auditor' : owner && !staff ? 'reporter' : staff ? 'solver' : 'viewer',
			// Auditors (and anyone looking at a deleted ticket) can only read it
			readOnly: !staff && !(owner && live),
			isLead: lead || admin,
			// After it's acknowledged, only whoever has it (or the lead or an admin) moves it along
			nextStatuses: staff && (data.status === 'Open' || lead || admin || String(data.assignedTo?._id ?? '') === String(req.accountId))
				? NEXT_STATUSES[data.status] || [] : [],
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
		if(!ticket || ticket.active === false){
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
		if(!ticket || ticket.active === false){
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
		const previous = ticket.assignedTo
		const me = await user.findById(req.accountId).select('name')
		const now = new Date()
		// Checking the on-call loads and saving happen under the team's lock (see withTeamLock)
		const outcome = await withTeamLock(team._id, async () => {
			const result = await onCallAssignee(team._id)
			if(!result.loads.length){
				return {error: `${NO_RESPONDER[result.reason](team.name)}, so this ticket can't be reassigned`}
			}
			// The primary or secondary on call, as long as they have fewer than MAX_ACTIVE open incidents
			const wanted = req.body?.responderId
			const options = result.loads.filter(l => String(l._id) !== String(previous?._id ?? ''))
			const pick = wanted ? options.find(l => String(l._id) === String(wanted)) : options.find(l => l.load < MAX_ACTIVE)
			if(wanted && !pick){
				const names = result.loads.map(l => `${l.name} (${l.role})`).join(' and ')
				return {error: `Tickets can only go to whoever is on call for ${team.name} right now: ${names}.`}
			}
			if(!pick || pick.load >= MAX_ACTIVE){
				return {error: pick
					? `${pick.name} already has ${MAX_ACTIVE} open incidents`
					: `${NO_RESPONDER['at-capacity'](team.name)}, so this ticket can't be reassigned`}
			}
			const target = {_id: pick._id, name: pick.name}
			if(previous && String(previous._id) === String(target._id)){
				return {error: `${target.name} already has this ticket`}
			}
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
				return {error: 'Someone else just changed this ticket. Reload and try again.'}
			}
			return {updated, target}
		})
		if(outcome.error){
			return res.status(409).send({error: outcome.error})
		}
		const {updated, target} = outcome
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
