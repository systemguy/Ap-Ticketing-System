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

module.exports = app => app.use('/teams', router)
