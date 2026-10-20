// On-call schedule: shifts for each team, who can see them (staff on or leading the team)
// and who can change them (the team lead). All times are Central.
const express = require('express')
const { isValidObjectId } = require('mongoose')
const Shift = require('../models/shift')
const Team = require('../models/team')
const User = require('../models/user')
const authMiddleware = require('../middleware/authMiddleWare')
const {
	SLOTS, slotTimes, teamProblems, responderProblems, ineligibleReason,
	canManage, visibleTeams, findTeam, whoIsOnCall, toClient, forCheck,
} = require('../helpers/shifts')
const { centralMoment, centralDate, addDays, isDateKey, formatDay } = require('../helpers/time')

const router = express.Router()
router.use(authMiddleware)

// Ids that can't exist get a clean 404 instead of a database error
router.param('shiftId', (req, res, next, id) =>
	isValidObjectId(id) ? next() : res.status(404).send({error: 'Shift not found'}))

// The logged-in account. Sends a 401 and returns null if it no longer exists.
async function currentUser(req, res) {
	const me = await User.findById(req.accountId)
	if(!me) res.status(401).send({error: 'Account not found. Please log in again.'})
	return me
}

const withNames = (query) => query.populate('team', 'name').populate('responder', 'name')

// Shifts for the teams you're on or lead. Defaults to today and the next five weeks.
// Query: from, to (YYYY-MM-DD, Central, inclusive) and team (name or id)
router.get('/', async(req, res) =>{
	try{
		const me = await currentUser(req, res)
		if(!me) return
		const teams = await visibleTeams(me)
		console.log(teams)
		console.log(teams.length)
		if(!teams.length){
			return res.status(403).send({error: 'Only staff can see the on-call schedule'})
		}
		const from = req.query.from ?? centralDate(new Date())
		const to = req.query.to ?? addDays(from, 35)
		if(!isDateKey(from) || !isDateKey(to) || to < from){
			return res.status(400).send({error: 'from and to must be dates like 2026-10-21, with to on or after from'})
		}
		let teamIds = teams.map(t => t._id)
		if(req.query.team){
			const team = findTeam(teams, req.query.team)
			if(!team){
				return res.status(403).send({error: "You can't see that team's schedule"})
			}
			teamIds = [team._id]
		}
		const shifts = await withNames(Shift.find({
			team: {$in: teamIds},
			start: {$lt: centralMoment(addDays(to, 1), 0)},
			end: {$gt: centralMoment(from, 0)},
		})).sort({start: 1})
		return res.send({shifts: shifts.map(toClient)})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to load the schedule'})
	}
})

// Who is on call for a team now, or at ?at= (a date and time). Same visibility as above.
router.get('/on-call', async(req, res) =>{
	try{
		const me = await currentUser(req, res)
		if(!me) return
		const teams = await visibleTeams(me)
		if(!teams.length){
			return res.status(403).send({error: 'Only staff can see the on-call schedule'})
		}
		const team = req.query.team ? findTeam(teams, req.query.team) : (teams.length === 1 ? teams[0] : null)
		if(!team){
			return req.query.team
				? res.status(403).send({error: "You can't see that team's schedule"})
				: res.status(400).send({error: 'Say which team, e.g. ?team=HVAC'})
		}
		const at = req.query.at ? new Date(req.query.at) : new Date()
		if(isNaN(at)){
			return res.status(400).send({error: 'at must be a date and time, e.g. 2026-10-24T10:00:00-05:00'})
		}
		const result = await whoIsOnCall(team._id, at)
		return res.send({
			team: {_id: team._id, name: team.name},
			at,
			responder: result.responder ? {_id: result.responder._id, name: result.responder.name} : null,
			reason: result.reason ?? null,
			shift: result.shift ? toClient(result.shift) : null,
		})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to look up who is on call'})
	}
})

// Add shifts (team leads, for their own teams). Body: { shifts: [{ team, employeeId, date, shift }] }
// team is a name or id and defaults to the person's home team; shift is morning, evening or overnight.
// All or nothing: if anything is wrong, nothing is saved and every problem is listed.
// Exact repeats of shifts already on the schedule are skipped, as the schedule page expects.
router.post('/', async(req, res) =>{
	try{
		const me = await currentUser(req, res)
		if(!me) return
		const items = req.body?.shifts
		if(!Array.isArray(items) || !items.length || items.length > 200){
			return res.status(400).send({error: 'Send shifts as a list of 1 to 200 items like { team, employeeId, date, shift }'})
		}
		const now = new Date()
		const teams = await Team.find()
		const ids = items.map(i => i?.employeeId ?? i?.responder).filter(id => isValidObjectId(id))
		const people = await User.find({_id: {$in: ids}}).select('name team role active')
		const personById = new Map(people.map(p => [String(p._id), p]))

		const notAllowed = new Set()
		const errors = []
		const wanted = []
		items.forEach((item, i) => {
			const label = items.length > 1 ? `Shift ${i + 1}: ` : ''
			const slot = item?.shift ?? item?.slot
			const person = personById.get(String(item?.employeeId ?? item?.responder))
			if(!person) return errors.push(`${label}choose who covers the shift`)
			if(!item.team && !isValidObjectId(person.team)) return errors.push(`${label}${person.name} is a reporter and can't be put on a shift`)
			const team = item.team ? findTeam(teams, item.team) : teams.find(t => String(t._id) === String(person.team))
			if(!team) return errors.push(`${label}there's no team called "${item.team}"`)
			if(!canManage(me, team)) return notAllowed.add(`Only ${team.name}'s team lead can change its schedule`)
			if(!SLOTS[slot]) return errors.push(`${label}"${slot}" isn't a shift. Use morning, evening or overnight`)
			if(!isDateKey(item.date)) return errors.push(`${label}the date must look like 2026-10-21`)
			const reason = ineligibleReason(person, team)
			if(reason) return errors.push(label + reason)
			const {start, end} = slotTimes(item.date, slot)
			if(end <= now) return errors.push(`${label}the ${slot} shift on ${formatDay(start)} is already over`)
			wanted.push({team: team._id, teamName: team.name, responder: person._id, responderName: person.name, slot, date: item.date, start, end})
		})
		if(notAllowed.size){
			return res.status(403).send({error: [...notAllowed]})
		}
		if(errors.length){
			return res.status(400).send({error: [...new Set(errors)]})
		}

		// Compare with what's already scheduled for those teams, and for those people on any team
		const teamIds = [...new Set(wanted.map(s => String(s.team)))]
		const personIds = [...new Set(wanted.map(s => String(s.responder)))]
		const existing = (await withNames(Shift.find({
			end: {$gt: now},
			$or: [{team: {$in: teamIds}}, {responder: {$in: personIds}}],
		}))).map(forCheck)
		const added = []
		const skipped = []
		for(const s of wanted){
			const taken = [...existing, ...added].find(e => String(e.team) === String(s.team) && +e.start === +s.start)
			if(taken && String(taken.responder) === String(s.responder)){
				skipped.push(s)
			}else if(taken){
				errors.push(`${s.teamName} already has ${taken.responderName} on the ${s.slot} shift on ${formatDay(s.start)}. Change who covers that shift instead`)
			}else{
				added.push(s)
			}
		}
		if(!errors.length && added.length){
			const after = [...existing, ...added]
			for(const teamId of teamIds){
				const team = teams.find(t => String(t._id) === teamId)
				errors.push(...teamProblems(team.name, after.filter(s => String(s.team) === teamId), now))
			}
			errors.push(...responderProblems(after.filter(s => personIds.includes(String(s.responder))), now))
		}
		if(errors.length){
			return res.status(400).send({error: [...new Set(errors)]})
		}

		const created = added.length
			? await Shift.insertMany(added.map(({teamName, responderName, ...s}) => ({...s, createdBy: me._id})))
			: []
		const saved = await withNames(Shift.find({_id: {$in: created.map(s => s._id)}})).sort({start: 1})
		return res.status(created.length ? 201 : 200).send({
			added: saved.map(toClient),
			skipped: skipped.map(s => ({team: s.teamName, employeeId: s.responder, date: s.date, shift: s.slot})),
		})
	}catch(err){
		if(err.code === 11000){
			return res.status(409).send({error: 'Someone else just changed this schedule. Reload and try again.'})
		}
		console.log(err)
		return res.status(500).send({error: 'Failed to save the shifts'})
	}
})

// Change who covers a shift (team leads). Body: { employeeId }
router.patch('/:shiftId', async(req, res) =>{
	try{
		const me = await currentUser(req, res)
		if(!me) return
		const shift = await withNames(Shift.findById(req.params.shiftId))
		if(!shift){
			return res.status(404).send({error: 'Shift not found'})
		}
		const team = await Team.findById(shift.team._id)
		if(!canManage(me, team)){
			return res.status(403).send({error: `Only ${team.name}'s team lead can change its schedule`})
		}
		const now = new Date()
		if(shift.end <= now){
			return res.status(400).send({error: 'This shift is already over'})
		}
		const personId = req.body?.employeeId ?? req.body?.responder
		const person = isValidObjectId(personId) ? await User.findById(personId).select('name team role active') : null
		if(!person){
			return res.status(400).send({error: 'Choose who should cover the shift'})
		}
		const reason = ineligibleReason(person, team)
		if(reason){
			return res.status(400).send({error: reason})
		}
		if(String(shift.responder?._id) === String(person._id)){
			return res.send(toClient(shift))
		}
		// The new person can't already be on call for another team at that time
		const theirs = (await withNames(Shift.find({responder: person._id, end: {$gt: now}, _id: {$ne: shift._id}}))).map(forCheck)
		const moved = {...forCheck(shift), responder: person._id, responderName: person.name}
		const problems = responderProblems([...theirs, moved], now)
		if(problems.length){
			return res.status(400).send({error: problems})
		}
		shift.responder = person._id
		await shift.save()
		return res.send(toClient(await withNames(Shift.findById(shift._id))))
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to update the shift'})
	}
})

// Remove a shift (team leads). Refused if it would leave the team without coverage.
router.delete('/:shiftId', async(req, res) =>{
	try{
		const me = await currentUser(req, res)
		if(!me) return
		const shift = await Shift.findById(req.params.shiftId)
		if(!shift){
			return res.status(404).send({error: 'Shift not found'})
		}
		const team = await Team.findById(shift.team)
		if(!canManage(me, team)){
			return res.status(403).send({error: `Only ${team.name}'s team lead can change its schedule`})
		}
		const now = new Date()
		if(shift.end > now){
			const rest = (await withNames(Shift.find({team: team._id, end: {$gt: now}, _id: {$ne: shift._id}}))).map(forCheck)
			const problems = teamProblems(team.name, rest, now)
			if(problems.length){
				return res.status(400).send({error: problems.map(p => `Can't remove this shift. Without it, ${p}`)})
			}
		}
		await shift.deleteOne()
		return res.send({deleted: true, shiftId: shift._id})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to remove the shift'})
	}
})

module.exports = app => app.use('/shifts', router)
