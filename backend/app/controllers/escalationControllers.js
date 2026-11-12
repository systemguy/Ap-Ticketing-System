// Escalation policies: who an unacknowledged ticket goes to at each level, and after how long
// for each severity, then how long the last level gets before the final step. Staff on a team
// (and its lead) can see the policy; only the team lead or an admin can change it. Same
// visibility rules as the on-call schedule. A lead of several teams can copy one team's policy
// into another's form (GET /escalation/:team/copy-from/:source); people who aren't on the
// target team are left out, so HVAC's Bob never ends up in Wifi's chain.
const express = require('express')
const EscalationPolicy = require('../models/escalationPolicy')
const Ticket = require('../models/tickets')
const Service = require('../models/services')
const User = require('../models/user')
const authMiddleware = require('../middleware/authMiddleWare')
const { canManage, visibleTeams, findTeam } = require('../helpers/shifts')
const {
	DEFAULT_LEVELS, DEFAULT_FINAL, MAX_LEVELS, MAX_MINUTES,
	personProblem, resolveLevel, validatePolicy, finalTimes, nextEscalation,
} = require('../helpers/escalation')

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

	// Open (unacknowledged) tickets for the team's services, and when each one escalates next.
	// Tickets that reached the final step come first.
	const services = await Service.find({teamId: team.name}).select('name')
	const open = await Ticket.find({status: 'Open', service: {$in: services.map(s => s.name)}})
		.select('title severity unit service status createdAt escalationLevel escalationClockAt escalationExhaustedAt assignedTo')
		.populate('assignedTo', 'name')
		.sort({escalationExhaustedAt: -1, createdAt: 1})
	const tickets = await Promise.all(open.map(async (t) => {
		const next = nextEscalation(t, policy)
		let upcoming = null
		if(next?.final){
			upcoming = {final: true, level: next.level, dueAt: next.dueAt}
		}else if(next && !next.done){
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
			finished: Boolean(t.escalationExhaustedAt),
			finishedAt: t.escalationExhaustedAt ?? null,
		}
	}))

	// The "who gets it" dropdown: this team's people and its lead, then admins (building
	// management). Nobody from another team, so one team's policy never points at another's staff.
	let candidates = []
	let copySources = []
	if(editable){
		const lead = team.lead?._id ?? null
		const users = await User.find({active: {$ne: false}, $or: [{team: team.name}, {_id: lead}, {role: 'admin'}]})
			.select('name team role').sort({name: 1})
		candidates = users.map(u => ({
			_id: u._id,
			name: u.name,
			team: isStaff(u) ? u.team : null,
			group: u.team === team.name || String(u._id) === String(lead) ? 'team' : 'admin',
		}))
		// Other teams this person also manages that have a saved policy to copy from
		const others = (await visibleTeams(me)).filter(t => String(t._id) !== String(team._id) && canManage(me, t))
		const saved = await EscalationPolicy.find({team: {$in: others.map(t => t._id)}, 'levels.0': {$exists: true}}).select('team')
		copySources = others.filter(t => saved.some(p => String(p.team) === String(t._id))).map(t => t.name)
	}

	return {
		team: {_id: team._id, name: team.name, lead: team.lead ? {_id: team.lead._id, name: team.lead.name} : null},
		canEdit: editable,
		policy: policy ? {
			enabled: policy.enabled,
			levels,
			finalAfter: policy.levels.length ? finalTimes(policy) : DEFAULT_FINAL,
			updatedAt: policy.updatedAt,
			updatedBy: policy.updatedBy?.name ?? null,
		} : null,
		defaults: DEFAULT_LEVELS,
		defaultFinal: DEFAULT_FINAL,
		limits: {levels: MAX_LEVELS, minutes: MAX_MINUTES},
		candidates,
		copySources,
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

// GET /escalation/:team/copy-from/:source
// A lead of both teams (or an admin) gets :source's policy rewritten for :team, to load into the
// form. Nothing is saved: they review it and save it like any other change. Role levels (on call,
// team lead) carry over as roles, so they point at :team's own on-call person and lead. A
// specific person who isn't on :team (and isn't its lead or an admin) is left out and listed in
// `dropped`, so a poor copy can never send :team's tickets to the other team's staff.
router.get('/:team/copy-from/:source', async(req, res) =>{
	try{
		const found = await loadTeam(req, res)
		if(!found) return
		const {me, team} = found
		if(!canManage(me, team)){
			return res.status(403).send({error: `Only ${team.lead?.name ?? "the team's lead"} or an admin can change ${team.name}'s escalation policy`})
		}
		const source = findTeam(await visibleTeams(me), req.params.source)
		if(!source || String(source._id) === String(team._id)){
			return res.status(404).send({error: 'Choose another team you manage to copy from'})
		}
		if(!canManage(me, source)){
			return res.status(403).send({error: `You can only copy from a team you lead. You don't manage ${source.name}.`})
		}
		const policy = await EscalationPolicy.findOne({team: source._id}).populate('levels.person', 'name team role active')
		if(!policy?.levels?.length){
			return res.status(404).send({error: `${source.name} has no escalation policy to copy`})
		}
		const dropped = []
		const levels = []
		for(const [i, l] of policy.levels.entries()){
			if(l.assignTo === 'person'){
				const problem = personProblem(l.person, team)
				if(problem){
					dropped.push(`Level ${i + 1} (${l.person?.name ?? 'a deleted account'}) was left out: ${problem}`)
					continue
				}
			}
			const prev = levels[levels.length - 1]
			const same = prev && prev.assignTo === l.assignTo && l.assignTo !== 'on-call'
				&& (l.assignTo !== 'person' || String(prev.person._id) === String(l.person._id))
			if(same){
				dropped.push(`Level ${i + 1} was left out because it would give the ticket to the same person twice in a row`)
				continue
			}
			levels.push({
				assignTo: l.assignTo,
				person: l.assignTo === 'person' ? {_id: l.person._id, name: l.person.name} : null,
				after: {...l.after.toObject?.() ?? l.after},
			})
		}
		if(!levels.length){
			return res.status(409).send({error: `Nothing in ${source.name}'s policy applies to ${team.name}: every level points at someone who isn't on ${team.name}.`})
		}
		const finalAfter = finalTimes(policy)
		return res.send({
			source: source.name,
			enabled: policy.enabled,
			levels,
			finalAfter: {...finalAfter.toObject?.() ?? finalAfter},
			dropped,
		})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to copy the escalation policy'})
	}
})

// PUT /escalation/:team  body: { enabled, levels: [{ assignTo, person?, after: { low, moderate, high, critical } }],
//                                finalAfter: { low, moderate, high, critical } }
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
		const {levels, finalAfter, errors} = await validatePolicy(req.body?.levels, req.body?.finalAfter, team)
		if(errors.length){
			return res.status(400).send({error: errors})
		}
		const enabled = req.body?.enabled !== false
		// Restart the clock for old tickets when escalation is switched on (new policy or re-enabled)
		const before = await EscalationPolicy.findOne({team: team._id}).select('enabled enabledAt')
		const set = {levels, finalAfter, enabled, updatedBy: me._id}
		if(enabled && (!before || !before.enabled || !before.enabledAt)) set.enabledAt = new Date()
		await EscalationPolicy.findOneAndUpdate(
			{team: team._id},
			{$set: set},
			{upsert: true, setDefaultsOnInsert: true})
		return res.send({...await pagePayload(me, team), message: `${team.name}'s escalation policy is saved${enabled ? '' : ' (turned off)'}.`})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to save the escalation policy'})
	}
})

module.exports = app => app.use('/escalation', router)
