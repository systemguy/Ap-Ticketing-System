// Admin portal: every team, its lead and who is on call, plus creating, editing and deleting
// accounts, teams and services. Every route here requires role "admin" on the logged-in account.
// Make one with:
//   node --env-file=.env scripts/make-admin.js someone@example.com
//
// Deleting is always a soft delete (see helpers/softDelete.js) and is refused until whatever
// depends on the item has been reassigned by hand (see helpers/removal.js).
const express = require('express')
const { isValidObjectId } = require('mongoose')
const User = require('../models/user')
const Team = require('../models/team')
const Service = require('../models/services')
const Ticket = require('../models/tickets')
const Shift = require('../models/shift')
const authMiddleware = require('../middleware/authMiddleWare')
const { whoIsOnCall } = require('../helpers/shifts')
const { ACTIVE_STATUSES } = require('../helpers/tickets')
const { NOT_DELETED } = require('../helpers/softDelete')
const { personProblems, serviceProblems, teamProblems, refusal } = require('../helpers/removal')

const router = express.Router()
router.use(authMiddleware)

// Only admins get past this point
router.use(async (req, res, next) => {
	try{
		const me = await User.findById(req.accountId).select('name role active')
		if(!me){
			return res.status(401).send({error: 'Account not found. Please log in again.'})
		}
		if(me.role !== 'admin' || me.active === false){
			return res.status(403).send({error: 'Only administrators can use the admin portal'})
		}
		req.admin = me
		return next()
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to check your account'})
	}
})

for(const [param, label] of [['teamId', 'Team'], ['userId', 'Account'], ['serviceId', 'Service']]){
	router.param(param, (req, res, next, id) =>
		isValidObjectId(id) ? next() : res.status(404).send({error: `${label} not found`}))
}

// Staff are people with a home team; reporters have none (stored as "user")
const isStaff = (u) => Boolean(u.team) && u.team !== 'user'
const deletion = (doc) => doc.active === false
	? {deletedAt: doc.deletedAt ?? null, deletedBy: doc.deletedBy ? {_id: doc.deletedBy._id, name: doc.deletedBy.name} : null}
	: {}
const fail = (res, err, what) => {
	console.log(err)
	return res.status(500).send({error: `Failed to ${what}`})
}

// Everything the portal's first screen needs, in one request
router.get('/overview', async (req, res) => {
	try{
		const now = new Date()
		const [allTeams, services, users, tickets] = await Promise.all([
			Team.find().sort({name: 1}).populate('lead', 'name email active').populate('deletedBy', 'name'),
			Service.find(NOT_DELETED).select('name teamId').sort({name: 1}),
			User.find().select('team role active'),
			Ticket.find(NOT_DELETED).select('status assignedTo'),
		])
		const teams = allTeams.filter((t) => t.active !== false)
		const teamRows = await Promise.all(teams.map(async (t) => {
			const [onCall, last] = await Promise.all([
				whoIsOnCall(t._id, now),
				Shift.findOne({team: t._id, end: {$gt: now}}).sort({end: -1}).select('end'),
			])
			return {
				_id: t._id,
				name: t.name,
				lead: t.lead ? {_id: t.lead._id, name: t.lead.name, active: t.lead.active !== false} : null,
				services: services.filter((s) => s.teamId === t.name).map((s) => s.name),
				onCall: onCall.responder ? {_id: onCall.responder._id, name: onCall.responder.name, until: onCall.shift.end} : null,
				onCallReason: onCall.reason ?? null,
				scheduledUntil: last?.end ?? null,
				staff: users.filter((u) => u.team === t.name && u.active !== false).length,
			}
		}))
		const active = tickets.filter((t) => ACTIVE_STATUSES.includes(t.status))
		return res.send({
			teams: teamRows,
			deletedTeams: allTeams.filter((t) => t.active === false).map((t) => ({_id: t._id, name: t.name, ...deletion(t)})),
			unownedServices: services.filter((s) => !s.teamId || !teams.some((t) => t.name === s.teamId)).map((s) => s.name),
			counts: {
				activeTickets: active.length,
				unassignedTickets: active.filter((t) => !t.assignedTo).length,
				teamsWithoutOnCall: teamRows.filter((t) => !t.onCall).length,
				staff: users.filter((u) => isStaff(u) && u.active !== false).length,
				reporters: users.filter((u) => !isStaff(u) && !['admin', 'auditor'].includes(u.role)).length,
				auditors: users.filter((u) => u.role === 'auditor' && u.active !== false).length,
				deactivated: users.filter((u) => u.active === false).length,
			},
		})
	}catch(err){
		return fail(res, err, 'load the overview')
	}
})

// ---------- Accounts ----------

// Every account (deleted ones included), with the teams each person leads
router.get('/users', async (req, res) => {
	try{
		const [users, teams] = await Promise.all([
			User.find().select('name email role team active createdAt deletedAt deletedBy').populate('deletedBy', 'name').sort({name: 1}),
			Team.find({lead: {$ne: null}, ...NOT_DELETED}).select('name lead'),
		])
		return res.send({users: users.map((u) => ({
			_id: u._id,
			name: u.name,
			email: u.email,
			role: u.role,
			team: isStaff(u) ? u.team : null,
			active: u.active !== false,
			leads: teams.filter((t) => String(t.lead) === String(u._id)).map((t) => t.name),
			createdAt: u.createdAt,
			...deletion(u),
		}))})
	}catch(err){
		return fail(res, err, 'load accounts')
	}
})

// Delete (deactivate) or restore an account. Body: { active: boolean }
// A deleted account can't log in, can't register again with the same email, and is never on call.
// Refused while the person has current or future shifts, leads a team, is named in an escalation
// level, or has open incidents assigned (see helpers/removal.js).
router.patch('/users/:userId/active', async (req, res) => {
	try{
		if(typeof req.body?.active !== 'boolean'){
			return res.status(400).send({error: 'Send { active: true } or { active: false }'})
		}
		const person = await User.findById(req.params.userId).select('name active role team')
		if(!person){
			return res.status(404).send({error: 'Account not found'})
		}
		const active = req.body.active
		if(active === (person.active !== false)){
			return res.send({user: {_id: person._id, name: person.name, active}})
		}
		if(!active){
			if(String(person._id) === String(req.admin._id)){
				return res.status(400).send({error: "You can't delete your own account"})
			}
			const problems = await personProblems(person)
			if(problems.length){
				return res.status(409).send(refusal(person.name, problems))
			}
		}
		const updated = await User.findByIdAndUpdate(person._id, User.deletionUpdate(req.admin._id, !active), {returnDocument: 'after'})
			.select('name active deletedAt deletedBy').populate('deletedBy', 'name')
		return res.send({user: {_id: updated._id, name: updated.name, active, ...deletion(updated)}})
	}catch(err){
		return fail(res, err, 'update the account')
	}
})

// Move a person to another team, or off every team. Body: { team: "HVAC" } or { team: null }
// They keep their past work. Leaving a team is refused while they still have shifts, escalation
// levels or open incidents on it (same rule as deleting). Reporters become solvers when they join
// a team, and solvers become reporters when they leave every team.
router.patch('/users/:userId/team', async (req, res) => {
	try{
		const name = req.body?.team === null ? null : typeof req.body?.team === 'string' ? req.body.team.trim() : undefined
		if(name === undefined || name === ''){
			return res.status(400).send({error: 'Send { team: "Team name" } or { team: null }'})
		}
		const person = await User.findById(req.params.userId).select('name role team active')
		if(!person){
			return res.status(404).send({error: 'Account not found'})
		}
		if(person.active === false){
			return res.status(400).send({error: `${person.name}'s account is deleted. Restore it first.`})
		}
		if(name && person.role === 'auditor'){
			return res.status(400).send({error: 'Auditors are read-only and can\'t join a team'})
		}
		const target = name ? await Team.findOne({name, ...NOT_DELETED}) : null
		if(name && !target){
			return res.status(400).send({error: `There is no team called ${name}`})
		}
		const current = isStaff(person) ? person.team : null
		if((target?.name ?? null) === current){
			return res.send({user: {_id: person._id, name: person.name, team: current, role: person.role}})
		}
		if(current){
			const problems = await personProblems(person, {onlyTeam: current})
			if(problems.length){
				const r = refusal(person.name, problems)
				return res.status(409).send({...r, error: r.error.replace("can't be deleted yet", `can't leave ${current} yet`)})
			}
		}
		const set = {team: target?.name ?? 'user'}
		if(target && person.role === 'user') set.role = 'solver'
		if(!target && ['solver', 'Staff'].includes(person.role)) set.role = 'user'
		await User.updateOne({_id: person._id}, {$set: set})
		return res.send({user: {_id: person._id, name: person.name, team: target?.name ?? null, role: set.role ?? person.role}})
	}catch(err){
		return fail(res, err, 'change the team')
	}
})

// Change what an account can do. Body: { role: "admin" | "auditor" | "standard" }
// "standard" means a normal account again: a solver if they're on a team, otherwise a reporter.
// Auditors see every incident but can't change anything, so they can't be on a team.
router.patch('/users/:userId/role', async (req, res) => {
	try{
		const role = req.body?.role
		if(!['admin', 'auditor', 'standard'].includes(role)){
			return res.status(400).send({error: 'Role must be admin, auditor or standard'})
		}
		const person = await User.findById(req.params.userId).select('name role team active')
		if(!person){
			return res.status(404).send({error: 'Account not found'})
		}
		if(person.active === false){
			return res.status(400).send({error: `${person.name}'s account is deleted. Restore it first.`})
		}
		if(String(person._id) === String(req.admin._id) && role !== 'admin'){
			return res.status(400).send({error: "You can't remove your own admin role"})
		}
		if(role === 'auditor' && isStaff(person)){
			return res.status(400).send({error: `${person.name} is on ${person.team}. Move them off the team first: auditors can't work incidents.`})
		}
		const next = role === 'standard' ? (isStaff(person) ? 'solver' : 'user') : role
		await User.updateOne({_id: person._id}, {$set: {role: next}})
		return res.send({user: {_id: person._id, name: person.name, role: next}})
	}catch(err){
		return fail(res, err, 'change the role')
	}
})

// ---------- Teams ----------

// Create a team. Body: { name }. Pick its lead afterwards.
router.post('/teams', async (req, res) => {
	try{
		const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
		if(!name){
			return res.status(400).send({error: 'Team name is required'})
		}
		const existing = await Team.findOne({name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')})
		if(existing){
			return res.status(400).send({error: existing.active === false
				? `${existing.name} was deleted. Restore it instead of creating it again.`
				: `${existing.name} already exists`})
		}
		const team = await Team.create({name})
		return res.status(201).send({team: {_id: team._id, name: team.name, lead: null}})
	}catch(err){
		return fail(res, err, 'create the team')
	}
})

// Choose a team's lead. Body: { lead: userId }. The lead must be an active responder (not a
// reporter). They don't have to be on that team: one person can lead several teams.
router.patch('/teams/:teamId/lead', async (req, res) => {
	try{
		const team = await Team.findOne({_id: req.params.teamId, ...NOT_DELETED})
		if(!team){
			return res.status(404).send({error: 'Team not found'})
		}
		const id = req.body?.lead
		const person = isValidObjectId(id) ? await User.findById(id).select('name team role active') : null
		if(!person){
			return res.status(400).send({error: 'Choose who should lead the team'})
		}
		if(person.active === false){
			return res.status(400).send({error: `${person.name}'s account is deactivated`})
		}
		if(!isStaff(person)){
			return res.status(400).send({error: `${person.name} is a reporter. Team leads must be responders.`})
		}
		team.lead = person._id
		await team.save()
		return res.send({team: {_id: team._id, name: team.name, lead: {_id: person._id, name: person.name}}})
	}catch(err){
		return fail(res, err, 'change the team lead')
	}
})

// Delete a team. Refused while it owns services, has members, or has current or future shifts.
// Its old incidents, shifts and escalation history stay.
router.delete('/teams/:teamId', async (req, res) => {
	try{
		const team = await Team.findOne({_id: req.params.teamId, ...NOT_DELETED})
		if(!team){
			return res.status(404).send({error: 'Team not found'})
		}
		const problems = await teamProblems(team)
		if(problems.length){
			return res.status(409).send(refusal(team.name, problems))
		}
		const updated = await Team.findByIdAndUpdate(team._id, Team.deletionUpdate(req.admin._id, true), {returnDocument: 'after'}).populate('deletedBy', 'name')
		return res.send({team: {_id: updated._id, name: updated.name, active: false, ...deletion(updated)}})
	}catch(err){
		return fail(res, err, 'delete the team')
	}
})

router.post('/teams/:teamId/restore', async (req, res) => {
	try{
		const updated = await Team.findOneAndUpdate({_id: req.params.teamId, active: false}, Team.deletionUpdate(req.admin._id, false), {returnDocument: 'after'})
		if(!updated){
			return res.status(404).send({error: 'No deleted team with that id'})
		}
		return res.send({team: {_id: updated._id, name: updated.name, active: true}})
	}catch(err){
		return fail(res, err, 'restore the team')
	}
})

// ---------- Services ----------

// Every service (deleted ones included), with its team and how many open incidents it has
router.get('/services', async (req, res) => {
	try{
		const [services, teams, open] = await Promise.all([
			Service.find().sort({name: 1}).populate('deletedBy', 'name'),
			Team.find().select('name active'),
			Ticket.aggregate([{$match: {...NOT_DELETED, status: {$in: ACTIVE_STATUSES}}}, {$group: {_id: '$service', n: {$sum: 1}}}]),
		])
		const openBy = new Map(open.map((o) => [o._id, o.n]))
		return res.send({services: services.map((s) => {
			const team = teams.find((t) => t.name === s.teamId)
			return {
				_id: s._id,
				name: s.name,
				team: team ? {name: team.name, active: team.active !== false} : null,
				openIncidents: openBy.get(s.name) ?? 0,
				active: s.active !== false,
				...deletion(s),
			}
		})})
	}catch(err){
		return fail(res, err, 'load services')
	}
})

// Create a service. Body: { name, team } (team is a team name, optional)
router.post('/services', async (req, res) => {
	try{
		const name = typeof req.body?.name === 'string' ? req.body.name.trim().toLowerCase() : ''
		const teamName = typeof req.body?.team === 'string' ? req.body.team.trim() : ''
		if(!name){
			return res.status(400).send({error: 'Service name is required'})
		}
		const existing = await Service.findOne({name})
		if(existing){
			return res.status(400).send({error: existing.active === false
				? `"${name}" was deleted. Restore it instead of creating it again.`
				: `"${name}" already exists`})
		}
		if(teamName && !await Team.exists({name: teamName, ...NOT_DELETED})){
			return res.status(400).send({error: `There is no team called ${teamName}`})
		}
		const service = await Service.create(teamName ? {name, teamId: teamName} : {name})
		return res.status(201).send({service: {_id: service._id, name: service.name, team: teamName || null}})
	}catch(err){
		return fail(res, err, 'create the service')
	}
})

// Give a service to another team. Body: { team: "HVAC" } or { team: null }
// Refused while it has open incidents, so nobody's work moves out from under them.
router.patch('/services/:serviceId', async (req, res) => {
	try{
		const teamName = req.body?.team === null ? null : typeof req.body?.team === 'string' ? req.body.team.trim() : undefined
		if(teamName === undefined || teamName === ''){
			return res.status(400).send({error: 'Send { team: "Team name" } or { team: null }'})
		}
		const service = await Service.findOne({_id: req.params.serviceId, ...NOT_DELETED})
		if(!service){
			return res.status(404).send({error: 'Service not found'})
		}
		if(teamName && !await Team.exists({name: teamName, ...NOT_DELETED})){
			return res.status(400).send({error: `There is no team called ${teamName}`})
		}
		if((teamName ?? null) === (service.teamId || null)){
			return res.send({service: {_id: service._id, name: service.name, team: teamName}})
		}
		const problems = await serviceProblems(service)
		if(problems.length){
			const r = refusal(`"${service.name}"`, problems)
			return res.status(409).send({...r, error: r.error.replace("can't be deleted yet", "can't move to another team yet")})
		}
		await Service.updateOne({_id: service._id}, teamName ? {$set: {teamId: teamName}} : {$unset: {teamId: 1}})
		return res.send({service: {_id: service._id, name: service.name, team: teamName}})
	}catch(err){
		return fail(res, err, 'move the service')
	}
})

// Delete a service: nobody can file new incidents against it. Refused while it has open
// incidents. Its old incidents keep their service and still count in history.
router.delete('/services/:serviceId', async (req, res) => {
	try{
		const service = await Service.findOne({_id: req.params.serviceId, ...NOT_DELETED})
		if(!service){
			return res.status(404).send({error: 'Service not found'})
		}
		const problems = await serviceProblems(service)
		if(problems.length){
			return res.status(409).send(refusal(`"${service.name}"`, problems))
		}
		const updated = await Service.findByIdAndUpdate(service._id, Service.deletionUpdate(req.admin._id, true), {returnDocument: 'after'}).populate('deletedBy', 'name')
		return res.send({service: {_id: updated._id, name: updated.name, active: false, ...deletion(updated)}})
	}catch(err){
		return fail(res, err, 'delete the service')
	}
})

// Restore a service. Refused if the team that owned it was deleted (give it a team first).
router.post('/services/:serviceId/restore', async (req, res) => {
	try{
		const service = await Service.findOne({_id: req.params.serviceId, active: false})
		if(!service){
			return res.status(404).send({error: 'No deleted service with that id'})
		}
		if(service.teamId && !await Team.exists({name: service.teamId, ...NOT_DELETED})){
			return res.status(409).send({error: `"${service.name}" belonged to ${service.teamId}, which was deleted. Restore that team first.`})
		}
		await Service.updateOne({_id: service._id}, Service.deletionUpdate(req.admin._id, false))
		return res.send({service: {_id: service._id, name: service.name, active: true}})
	}catch(err){
		return fail(res, err, 'restore the service')
	}
})

module.exports = app => app.use('/admin', router)
