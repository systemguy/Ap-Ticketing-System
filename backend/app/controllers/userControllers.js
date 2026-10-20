// Profile routes for the logged-in user (Sprint 2 profile page)
const express = require('express')
const { isValidObjectId } = require('mongoose')
const User = require('../models/user')
const Team = require('../models/team')
const Ticket = require('../models/tickets')
const authMiddleware = require('../middleware/authMiddleWare')
const { publicUser } = require('../helpers/users')
const { visibleTeams } = require('../helpers/shifts')

const router = express.Router()
router.use(authMiddleware)

// The logged-in user, plus their team's name if they're a solver (null for reporters)
// and the teams they lead (team lead is not a role, so it comes from the teams)
router.get('/me', async(req, res) =>{
	try{
		const user = await User.findById(req.accountId)
		if(!user){
			return res.status(401).send({error: 'Account not found. Please log in again.'})
		}
		const team = isValidObjectId(user.team) ? await Team.findById(user.team).select('name') : null
		const leads = await Team.find({lead: user._id}).select('name').sort({name: 1})
		return res.send({...publicUser(user), teamName: team?.name ?? null, leads: leads.map(t => ({_id: t._id, name: t.name}))})
	}catch(err){
		console.error('Load profile failed:', err.message)
		return res.status(500).send({error: 'Failed to load profile'})
	}
})

// Saves the bio, the only profile field users edit for now (max 500 characters)
router.patch('/me', async(req, res) =>{
	const {bio} = req.body || {}
	if(typeof bio !== 'string'){
		return res.status(400).send({error: 'Bio must be text'})
	}
	try{
		// Updates only the bio, so the 500-character limit is the only check that runs
		const user = await User.findByIdAndUpdate(req.accountId, {bio},
			{runValidators: true, returnDocument: 'after'})
		if(!user){
			return res.status(401).send({error: 'Account not found. Please log in again.'})
		}
		return res.send(publicUser(user))
	}catch(err){
		if(err.name === 'ValidationError')
			return res.status(400).send({error: Object.values(err.errors).map(e => e.message)})
		console.error('Save bio failed:', err.message)
		return res.status(500).send({error: 'Failed to save bio'})
	}
})

// Tickets this user filed or is assigned to, newest first. The profile page splits them into columns.
router.get('/me/tickets', async(req, res) =>{
	try{
		const tickets = await Ticket.find({$or: [{userPosted: req.accountId}, {assignedTo: req.accountId}]})
			.select('-events')
			.sort({createdAt: -1})
			.populate('userPosted', 'name email')
			.populate('assignedTo', 'name email')
		return res.send({tickets})
	}catch(err){
		console.error('Load my tickets failed:', err.message)
		return res.status(500).send({error: 'Failed to load your tickets'})
	}
})

// Staff the logged-in user can see on the schedule pages (?role=staff), for the Employee dropdowns.
// department is each person's home team; departments lists every team they can cover.
// Reporters get a 403: they don't work shifts.
router.get('/', async(req, res) =>{
	if(req.query.role !== 'staff'){
		return res.status(400).send({error: 'Use /users?role=staff'})
	}
	try{
		const me = await User.findById(req.accountId)
		if(!me){
			return res.status(401).send({error: 'Account not found. Please log in again.'})
		}
		const teams = await visibleTeams(me)
		if(!teams.length){
			return res.status(403).send({error: 'Only staff can see the team roster'})
		}
		const teamIds = teams.map(t => String(t._id))
		const leadIds = teams.map(t => t.lead).filter(Boolean)
		const people = await User.find({$or: [{team: {$in: teamIds}}, {_id: {$in: leadIds}}], active: {$ne: false}})
			.select('name team').sort({name: 1})
		const allTeams = await Team.find().select('name')
		const nameOf = id => allTeams.find(t => String(t._id) === String(id))?.name ?? null
		return res.send({staff: people.map(p => ({
			_id: p._id,
			name: p.name,
			department: nameOf(p.team),
			departments: teams.filter(t => String(t._id) === String(p.team) || String(t.lead) === String(p._id)).map(t => t.name),
		}))})
	}catch(err){
		console.error('Load staff failed:', err.message)
		return res.status(500).send({error: 'Failed to load staff'})
	}
})

module.exports = app => app.use('/users', router)
