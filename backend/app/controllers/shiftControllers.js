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
	canManage, visibleTeams, findTeam, onCallAssignee, toClient, forCheck,
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

const withNames = (query) => query.populate('team', 'name').populate('responder', 'name').populate('secondary', 'name')

// Shifts for the teams you're on or lead. Defaults to today and the next five weeks.
// Query: from, to (YYYY-MM-DD, Central, inclusive) and team (name or id)
router.get('/', async(req, res) =>{
	try{
		const me = await currentUser(req, res)
		if(!me) return
		const teams = await visibleTeams(me)
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
		const result = await onCallAssignee(team._id, at)
		const shift = result.shift ? await withNames(Shift.findById(result.shift._id)) : null
		const primary = result.loads.find(l => l.role === 'primary')
		const secondary = result.loads.find(l => l.role === 'secondary')
		return res.send({
			team: {_id: team._id, name: team.name},
			at,
			// The primary and secondary on call, with how many open incidents each has
			responder: primary ? {_id: primary._id, name: primary.name, load: primary.load} : null,
			secondary: secondary ? {_id: secondary._id, name: secondary.name, load: secondary.load} : null,
			// Who the next new ticket would go to
			next: result.responder ? {_id: result.responder._id, name: result.responder.name, role: result.role} : null,
			reason: result.reason ?? null,
			shift: shift ? toClient(shift) : null,
		})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to look up who is on call'})
	}
})

// Add shifts (team leads, for their own teams). Body: { shifts: [{ team, employeeId, secondaryId, date, shift }] }
// employeeId is the primary on call and secondaryId the secondary; both are required.
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
		const ids = items.flatMap(i => [i?.employeeId ?? i?.responder, i?.secondaryId ?? i?.secondary]).filter(id => isValidObjectId(id))
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
			if(!item.team && (!person.team || person.team === 'user')) return errors.push(`${label}${person.name} is a reporter and can't be put on a shift`)
			const team = item.team ? findTeam(teams, item.team) : teams.find(t => t.name === person.team)
			if(!team) return errors.push(`${label}there's no team called "${item.team}"`)
			if(!canManage(me, team)) return notAllowed.add(`Only ${team.name}'s team lead can change its schedule`)
			if(!SLOTS[slot]) return errors.push(`${label}"${slot}" isn't a shift. Use morning, evening or overnight`)
			if(!isDateKey(item.date)) return errors.push(`${label}the date must look like 2026-10-21`)
			const reason = ineligibleReason(person, team)
			if(reason) return errors.push(label + reason)
			const second = personById.get(String(item?.secondaryId ?? item?.secondary))
			if(!second) return errors.push(`${label}choose a secondary on call`)
			if(String(second._id) === String(person._id)) return errors.push(`${label}the secondary on call has to be someone other than ${person.name}`)
			const secondReason = ineligibleReason(second, team)
			if(secondReason) return errors.push(`${label}secondary: ${secondReason}`)
			const {start, end} = slotTimes(item.date, slot)
			if(end <= now) return errors.push(`${label}the ${slot} shift on ${formatDay(start)} is already over`)
			wanted.push({team: team._id, teamName: team.name, responder: person._id, responderName: person.name, secondary: second._id, secondaryName: second.name, slot, date: item.date, start, end})
		})
		if(notAllowed.size){
			return res.status(403).send({error: [...notAllowed]})
		}
		if(errors.length){
			return res.status(400).send({error: [...new Set(errors)]})
		}

		// Compare with what's already scheduled for those teams, and for those people on any team
		const teamIds = [...new Set(wanted.map(s => String(s.team)))]
		const personIds = [...new Set(wanted.flatMap(s => [String(s.responder), String(s.secondary)]))]
		const existing = (await withNames(Shift.find({
			end: {$gt: now},
			$or: [{team: {$in: teamIds}}, {responder: {$in: personIds}}, {secondary: {$in: personIds}}],
		}))).map(forCheck)
		const added = []
		const skipped = []
		for(const s of wanted){
			const taken = [...existing, ...added].find(e => String(e.team) === String(s.team) && +e.start === +s.start)
			if(taken && String(taken.responder) === String(s.responder) && String(taken.secondary) === String(s.secondary)){
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
			errors.push(...responderProblems(after.filter(s => personIds.includes(String(s.responder)) || personIds.includes(String(s.secondary))), now))
		}
		if(errors.length){
			return res.status(400).send({error: [...new Set(errors)]})
		}

		const created = added.length
			? await Shift.insertMany(added.map(({teamName, responderName, secondaryName, ...s}) => ({...s, createdBy: me._id})))
			: []
		const saved = await withNames(Shift.find({_id: {$in: created.map(s => s._id)}})).sort({start: 1})
		return res.status(created.length ? 201 : 200).send({
			added: saved.map(toClient),
			skipped: skipped.map(s => ({team: s.teamName, employeeId: s.responder, secondaryId: s.secondary, date: s.date, shift: s.slot})),
		})
	}catch(err){
		if(err.code === 11000){
			return res.status(409).send({error: 'Someone else just changed this schedule. Reload and try again.'})
		}
		console.log(err)
		return res.status(500).send({error: 'Failed to save the shifts'})
	}
})

// Change who covers a shift (team leads). Body: { employeeId?, secondaryId? } (primary and/or secondary)
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
		const load = async (id) => isValidObjectId(id) ? await User.findById(id).select('name team role active') : null
		const primaryId = req.body?.employeeId ?? req.body?.responder ?? shift.responder?._id
		const secondaryId = req.body?.secondaryId ?? req.body?.secondary ?? shift.secondary?._id
		const [person, second] = await Promise.all([load(primaryId), load(secondaryId)])
		if(!person){
			return res.status(400).send({error: 'Choose who should cover the shift'})
		}
		if(!second){
			return res.status(400).send({error: 'Choose a secondary on call'})
		}
		if(String(person._id) === String(second._id)){
			return res.status(400).send({error: `The secondary on call has to be someone other than ${person.name}`})
		}
		const reason = ineligibleReason(person, team) || (ineligibleReason(second, team) && `Secondary: ${ineligibleReason(second, team)}`)
		if(reason){
			return res.status(400).send({error: reason})
		}
		if(String(shift.responder?._id) === String(person._id) && String(shift.secondary?._id) === String(second._id)){
			return res.send(toClient(shift))
		}
		// Neither person can be on call elsewhere at that time, and the primary can't work back to back
		const ids = [person._id, second._id]
		const theirs = (await withNames(Shift.find({
			end: {$gt: now}, _id: {$ne: shift._id},
			$or: [{responder: {$in: ids}}, {secondary: {$in: ids}}],
		}))).map(forCheck)
		const moved = {...forCheck(shift), responder: person._id, responderName: person.name, secondary: second._id, secondaryName: second.name}
		const problems = responderProblems([...theirs, moved], now)
		if(problems.length){
			return res.status(400).send({error: problems})
		}
		shift.responder = person._id
		shift.secondary = second._id
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
