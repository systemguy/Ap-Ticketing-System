// The services people can file incidents against, with the team that handles each one.
// Deleted services (and services of deleted teams) are left out. No login needed: the public
// Services page shows this list too.
const express = require('express')
const Service = require('../models/services')
const Team = require('../models/team')
const { NOT_DELETED } = require('../helpers/softDelete')

const router = express.Router()

router.get('/', async (req, res) => {
	try{
		const [services, teams] = await Promise.all([
			Service.find(NOT_DELETED).select('name teamId').sort({name: 1}),
			Team.find(NOT_DELETED).select('name'),
		])
		const live = new Set(teams.map((t) => t.name))
		return res.send({services: services
			.filter((s) => !s.teamId || live.has(s.teamId))
			.map((s) => ({name: s.name, team: s.teamId && live.has(s.teamId) ? s.teamId : null}))})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to load services'})
	}
})

module.exports = app => app.use('/services', router)
