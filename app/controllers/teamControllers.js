// Teams and their leads. "Who leads team X" is a single lookup on the team.
const express = require('express')
const Team = require('../models/team')
const authMiddleware = require('../middleware/authMiddleWare')

const router = express.Router()
router.use(authMiddleware)

router.get('/', async(req, res) =>{
	try{
		const teams = await Team.find().sort({name: 1}).populate('lead', 'name')
		return res.send({teams: teams.map(t => ({
			_id: t._id,
			name: t.name,
			lead: t.lead ? {_id: t.lead._id, name: t.lead.name} : null,
		}))})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to load teams'})
	}
})

router.patch('/set-lead/:teamName', async(req, res) =>{
	try{
		const team = await Team.findOne({name: req.params.teamName})
		const {lead} = req.body
		const teamwithNewLead =  await Team.findByIdAndUpdate(team._id, {lead})
		return res.send(teamwithNewLead) 
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to update team lead'})
	}
})
module.exports = app => app.use('/teams', router)