// Admin portal: an overview of every team, its lead and who is on call, plus the two admin
// powers the course roadmap names: choosing team leads and deactivating accounts (soft delete).
// Every route here requires role "admin" on the logged-in account. Make one with:
//   node --env-file=.env scripts/make-admin.js someone@example.com
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

router.param('teamId', (req, res, next, id) =>
	isValidObjectId(id) ? next() : res.status(404).send({error: 'Team not found'}))
router.param('userId', (req, res, next, id) =>
	isValidObjectId(id) ? next() : res.status(404).send({error: 'Account not found'}))

// Staff are people with a home team; reporters have none (stored as "user")
const isStaff = (u) => Boolean(u.team) && u.team !== 'user'

// Everything the portal's first screen needs, in one request
router.get('/overview', async (req, res) => {
	try{
		const now = new Date()
		const [teams, services, users, tickets] = await Promise.all([
			Team.find().sort({name: 1}).populate('lead', 'name email active'),
			Service.find().select('name teamId').sort({name: 1}),
			User.find().select('team role active'),
			Ticket.find().select('status assignedTo'),
		])
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
			unownedServices: services.filter((s) => !s.teamId || !teams.some((t) => t.name === s.teamId)).map((s) => s.name),
			counts: {
				activeTickets: active.length,
				unassignedTickets: active.filter((t) => !t.assignedTo).length,
				teamsWithoutOnCall: teamRows.filter((t) => !t.onCall).length,
				staff: users.filter((u) => isStaff(u) && u.active !== false).length,
				reporters: users.filter((u) => !isStaff(u) && u.role !== 'admin').length,
				deactivated: users.filter((u) => u.active === false).length,
			},
		})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to load the overview'})
	}
})

// Every account, with the teams each person leads
router.get('/users', async (req, res) => {
	try{
		const [users, teams] = await Promise.all([
			User.find().select('name email role team active createdAt').sort({name: 1}),
			Team.find({lead: {$ne: null}}).select('name lead'),
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
		}))})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to load accounts'})
	}
})

// Choose a team's lead. Body: { lead: userId }. The lead must be an active responder (not a
// reporter). They don't have to be on that team: one person can lead several teams.
router.patch('/teams/:teamId/lead', async (req, res) => {
	try{
		const team = await Team.findById(req.params.teamId)
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
		console.log(err)
		return res.status(500).send({error: 'Failed to change the team lead'})
	}
})

// Deactivate or reactivate an account (soft delete: nothing is removed). Body: { active: boolean }
// A deactivated responder is never treated as on call, and can't log in.
router.patch('/users/:userId/active', async (req, res) => {
	try{
		if(typeof req.body?.active !== 'boolean'){
			return res.status(400).send({error: 'Send { active: true } or { active: false }'})
		}
		const person = await User.findById(req.params.userId).select('name active role')
		if(!person){
			return res.status(404).send({error: 'Account not found'})
		}
		const active = req.body.active
		if(!active){
			if(String(person._id) === String(req.admin._id)){
				return res.status(400).send({error: "You can't deactivate your own account"})
			}
			const led = await Team.find({lead: person._id}).select('name')
			if(led.length){
				return res.status(400).send({error: `${person.name} leads ${led.map((t) => t.name).join(', ')}. Choose a new lead first.`})
			}
		}
		person.active = active
		await person.save()
		return res.send({user: {_id: person._id, name: person.name, active}})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to update the account'})
	}
})

module.exports = app => app.use('/admin', router)
