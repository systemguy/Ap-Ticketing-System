// Profile routes for the logged-in user (Sprint 2 profile page)
const express = require('express')
const { isValidObjectId } = require('mongoose')
const User = require('../models/user')
const Team = require('../models/team')
const Ticket = require('../models/tickets')
const authMiddleware = require('../middleware/authMiddleWare')
const { publicUser } = require('../helpers/users')

const router = express.Router()
router.use(authMiddleware)

// The logged-in user, plus their team's name if they're a solver (null for reporters)
router.get('/me', async(req, res) =>{
	try{
		const user = await User.findById(req.accountId)
		if(!user){
			return res.status(401).send({error: 'Account not found. Please log in again.'})
		}
		const team = isValidObjectId(user.team) ? await Team.findById(user.team).select('name') : null
		return res.send({...publicUser(user), teamName: team?.name ?? null})
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

module.exports = app => app.use('/users', router)
