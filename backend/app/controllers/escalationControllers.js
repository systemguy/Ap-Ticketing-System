// Escalation policies: who an unacknowledged ticket goes to at each level, and after how long
// for each severity. Staff on a team (and its lead) can see the policy; only the team lead
// or an admin can change it. Same visibility rules as the on-call schedule.
const express = require('express')
const EscalationPolicy = require('../models/escalationPolicy')
const Ticket = require('../models/tickets')
const Service = require('../models/services')
const User = require('../models/user')
const authMiddleware = require('../middleware/authMiddleWare')
const { canManage, visibleTeams, findTeam } = require('../helpers/shifts')
const { DEFAULT_LEVELS, MAX_LEVELS, MAX_MINUTES, resolveLevel, validateLevels, nextEscalation } = require('../helpers/escalation')

const router = express.Router()
router.use(authMiddleware)

const isStaff = (u) => Boolean(u?.team) && u.team !== 'user'

// The logged-in account and the team named in the URL, or sends the error and returns null
async function loadTeam(req, res) {
	const me = await User.findById(req.accountId)
	if(!me){
		res.status(401).send({error: 'Account not found. Please log in again.'})
		return null
	}
	const teams = await visibleTeams(me)
	if(!teams.length){
		res.status(403).send({error: 'Only staff can see escalation policies'})
		return null
	}
	const team = findTeam(teams, req.params.team)
	if(!team){
		res.status(403).send({error: "You can't see that team's escalation policy"})
		return null
	}
	await team.populate('lead', 'name active')
	return {me, team}
}

// Everything the page shows for one team
async function pagePayload(me, team) {
	const now = new Date()
	const editable = canManage(me, team)
	const policy = await EscalationPolicy.findOne({team: team._id})
		.populate('levels.person', 'name team role active')
		.populate('updatedBy', 'name')
	const people = new Map()

	// Who each level would reach right now
	const levels = await Promise.all((policy?.levels ?? []).map(async (l) => {
		const reach = await resolveLevel(l, team, now, people)
		return {
			assignTo: l.assignTo,
			person: l.person ? {_id: l.person._id, name: l.person.name, active: l.person.active !== false} : null,
			after: l.after,
			now: reach.user ? {_id: reach.user._id, name: reach.user.name, until: reach.until ?? null} : null,
			nobody: reach.user ? null : reach.reason,
		}
	}))

	// Open (unacknowledged) tickets for the team's services, and when each one escalates next
	const services = await Service.find({teamId: team.name}).select('name')
	const open = await Ticket.find({status: 'Open', service: {$in: services.map(s => s.name)}})
		.select('title severity unit service status createdAt escalationLevel escalationClockAt assignedTo')
		.populate('assignedTo', 'name')
		.sort({createdAt: 1})
	const tickets = await Promise.all(open.map(async (t) => {
		const next = nextEscalation(t, policy)
		let upcoming = null
		if(next && !next.done){
			const who = await resolveLevel(next.step, team, next.dueAt > now ? next.dueAt : now, people)
			upcoming = {level: next.level, dueAt: next.dueAt, assignTo: next.step.assignTo, to: who.user?.name ?? null, nobody: who.user ? null : who.reason}
		}
		return {
			_id: t._id,
			title: t.title,
			severity: t.severity,
			unit: t.unit,
			service: t.service,
			createdAt: t.createdAt,
			assignedTo: t.assignedTo ? {_id: t.assignedTo._id, name: t.assignedTo.name} : null,
			level: t.escalationLevel || 0,
			next: upcoming,
			finished: Boolean(next?.done),
		}
	}))

	// The "who gets it" dropdown: people on this team first, then other staff, then admins
	let candidates = []
	if(editable){
		const users = await User.find({active: {$ne: false}, $or: [{team: {$nin: [null, 'user']}}, {role: 'admin'}]})
			.select('name team role').sort({name: 1})
		const lead = String(team.lead?._id ?? '')
		candidates = users.map(u => ({
			_id: u._id,
			name: u.name,
			team: isStaff(u) ? u.team : null,
			group: u.team === team.name || String(u._id) === lead ? 'team' : isStaff(u) ? 'staff' : 'admin',
		}))
	}

	return {
		team: {_id: team._id, name: team.name, lead: team.lead ? {_id: team.lead._id, name: team.lead.name} : null},
		canEdit: editable,
		policy: policy ? {
			enabled: policy.enabled,
			levels,
			updatedAt: policy.updatedAt,
			updatedBy: policy.updatedBy?.name ?? null,
		} : null,
		defaults: DEFAULT_LEVELS,
		limits: {levels: MAX_LEVELS, minutes: MAX_MINUTES},
		candidates,
		tickets,
	}
}

// GET /escalation/:team  (team name like "HVAC", or its id)
router.get('/:team', async(req, res) =>{
	try{
		const found = await loadTeam(req, res)
		if(!found) return
		return res.send(await pagePayload(found.me, found.team))
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to load the escalation policy'})
	}
})

// PUT /escalation/:team  body: { enabled, levels: [{ assignTo, person?, after: { low, moderate, high, critical } }] }
// Team lead or admin only. Tickets already escalated keep their level; new time frames
// apply from their next escalation.
router.put('/:team', async(req, res) =>{
	try{
		const found = await loadTeam(req, res)
		if(!found) return
		const {me, team} = found
		if(!canManage(me, team)){
			return res.status(403).send({error: `Only ${team.lead?.name ?? "the team's lead"} or an admin can change ${team.name}'s escalation policy`})
		}
		const {levels, errors} = await validateLevels(req.body?.levels)
		if(errors.length){
			return res.status(400).send({error: errors})
		}
		const enabled = req.body?.enabled !== false
		await EscalationPolicy.findOneAndUpdate(
			{team: team._id},
			{$set: {levels, enabled, updatedBy: me._id}},
			{upsert: true, setDefaultsOnInsert: true})
		return res.send({...await pagePayload(me, team), message: `${team.name}'s escalation policy is saved${enabled ? '' : ' (turned off)'}.`})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to save the escalation policy'})
	}
})

module.exports = app => app.use('/escalation', router)
