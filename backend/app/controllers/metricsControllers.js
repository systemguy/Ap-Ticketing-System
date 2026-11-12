// Requirement change: uptime and speed (see helpers/metrics.js)
//   GET  /metrics/summary   numbers for the Performance page (admins and team leads)
//   POST /metrics/client    the browser reports how long the user waited
const express = require('express')
const User = require('../models/user')
const Team = require('../models/team')
const { RequestSample } = require('../models/metrics')
const authMiddleware = require('../middleware/authMiddleWare')
const { OPS, summary } = require('../helpers/metrics')

const router = express.Router()
router.use(authMiddleware)

router.get('/summary', async (req, res) => {
	try{
		const [me, leads] = await Promise.all([
			User.findById(req.accountId).select('role'),
			Team.exists({lead: req.accountId}),
		])
		if(me?.role !== 'admin' && !leads){
			return res.status(403).send({error: 'Only admins and team leads can see system performance'})
		}
		return res.send(await summary(String(req.query.window || '24h')))
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to load performance numbers'})
	}
})

router.post('/client', async (req, res) => {
	const op = req.body?.op
	const ms = Number(req.body?.ms)
	if(!OPS.includes(op) || !Number.isFinite(ms) || ms < 0 || ms > 120000){
		return res.status(400).send({error: `op must be one of ${OPS.join(', ')} and ms between 0 and 120000`})
	}
	try{
		// Max 20 reports a minute per person
		const recent = await RequestSample.countDocuments({source: 'client', account: req.accountId, at: {$gte: new Date(Date.now() - 60000)}})
		if(recent >= 20){
			return res.status(429).send({error: 'Too many timing reports; try again in a minute'})
		}
		await RequestSample.create({op, source: 'client', ms: Math.round(ms), status: 200, account: req.accountId})
		return res.status(204).end()
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to save the timing'})
	}
})

module.exports = app => app.use('/metrics', router)
