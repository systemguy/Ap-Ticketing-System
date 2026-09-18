const express = require('express')
const Ticket = require('../models/tickets')
const user = require('../models/user')
const Team = require('../models/team')
const authMiddleware =  require('../middleware/authMiddleWare')

const router = express.Router()
router.use(authMiddleware)


router.get('/', async (req, res)=>{
	try{
	const {accountId, team} = req
	const tickets = await Ticket.find({
					$or:[{userPosted: accountId},
					{team: team}]
					}).populate('userPosted', 'name email');
	return res.status(200).json({ tickets });
	}
	catch(err){
		console.log(err)
		return res.status(500).json({ error: 'Failed to fetch tickets' });
	}

})

router.post('/create', async(req, res)=>{
	try{
		const {title, description, team, unit, type} = req.body
		const userPosted = req.accountId
		const ticket = await Ticket.create({userPosted, title, description, team, unit, type, resolved: false})
		return res.send({ticket})
	}catch(err){
		console.log(err)
		res.status(500).json({error: 'failed to create tickets'})
	}

})

router.put('/delete/:ticketId', async(req, res) =>{
	try{
		const valticket = await Ticket.findById(req.params.ticketId)
		const {accountId, team} = req
		if(accountId !== valticket.userPosted._id && team !== valticket.team){
						console.log(err)
                        return res.status(400).send({error: "Unauthorized"})
                }


		const {resolved} = (req.body)
		const ticket = await Ticket.findByIdAndUpdate(req.params.ticketId,
			{resolved},
			{new: true})
		return res.send(ticket)
	}catch(err){
		console.log(err)
        res.status(500).json({error: 'failed to update tickets'})
	}
})

router.put('/update/:ticketId', async(req, res) =>{
	try{

		
		const valticket = await Ticket.findById(req.params.ticketId)
		if(req.accountId !== valticket.userPosted._id.toString() && req.team !== valticket.team){
						console.log(req.accountId)
						console.log(valticket.userPosted._id.toString())
						console.log(valticket.team)
                        return res.status(400).send({error: "Unauthorized"})
        }


		const {title, description, team, unit, type} = req.body
		const ticket = await Ticket.findByIdAndUpdate(req.params.ticketId,
			{title, description, team, unit, type},
			{new: true})
		return res.send(ticket)
	}catch(err){
		console.log(err)
                res.status(500).json({error: 'failed to update tickets'})
	}
})

module.exports = app => app.use('/tickets', router )
