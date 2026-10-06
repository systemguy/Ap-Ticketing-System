const express = require('express')
const Ticket = require('../models/tickets')
const user = require('../models/user')
const Team = require('../models/team')
const Service = require('../models/services')
const authMiddleware =  require('../middleware/authMiddleWare')

const router = express.Router()
router.use(authMiddleware)


router.get('/', async (req, res)=>{
	try{
	const {accountId, team} = req
	const services = await Service.find({ teamId: team }).select('name');
	const serviceNames = services.map(service => service.name);
	console.log(serviceNames)
	console.log(services)
	const tickets = await Ticket.find({
					$or:[{userPosted: accountId},
					 {service: { $in: serviceNames }} ]
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
		const {title, description, service, severity, unit, userComment, type} = req.body
		const serviceExists = await Service.findOne({name:service})
		if(!serviceExists){
			return res.status(401).json({error:"invalid service"})
		}
		if((severity < 1 || severity > 4)){
			return res.status(401).json({error:"invalid severity"})
		}
		const userPosted = req.accountId
		const createdAt = Date.now()
		const status = "Open"
		const ticket = await Ticket.create({userPosted, title, description, service, unit, severity ,type,status, createdAt, userComment, resolved: false})
		
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

router.put('/edit/:ticketId', async(req, res) =>{
	try{

		
		const valticket = await Ticket.findById(req.params.ticketId)
		if(req.accountId !== valticket.userPosted._id.toString() && req.team !== valticket.team){
						console.log(req.accountId)
						console.log(valticket.userPosted._id.toString())
						console.log(valticket.team)
                        return res.status(400).send({error: "Unauthorized"})
        }
		

		const {title, description, team, unit,severity,service, type} = req.body

		const serviceExists = await Service.findOne({name: service})
		let ticker = null
		if(!serviceExists){
			res.status(401).json({error:"invalid service"})
		}
		if(!(0<severity<=4)){
			return res.status(401).send("invalid severity")
		}
		if(req.accountId == valticket.userPosted._id.toString()){
			const {userComment} = req.body
			const {solverComment} = req.body
			if(solverComment){  return res.status(400).send({error: "Unauthorized"})}
			ticket = await Ticket.findByIdAndUpdate(req.params.ticketId,
			{title, description, team, unit, severity, type, userComment},
			{new: true})
		}
		if(req.team == valticket.team){
			const {solverComment} = req.body
			const {userComment} = req.body
			if(userComment){  return res.status(400).send({error: "Unauthorized"})}
			ticket = await Ticket.findByIdAndUpdate(req.params.ticketId,
			{title, description, team, unit, severity, type, solverComment},
			{new: true})
		}
		
		return res.send(ticket)
	}catch(err){
		console.log(err)
        res.status(500).json({error: 'failed to update tickets'})
	}
})
router.put('/update/:ticketId', async(req, res) =>{
	try{

		
		const valticket = await Ticket.findById(req.params.ticketId)
		const service = await Service.findOne({ teamId: req.team, name: valticket.service});
		//const serviceNames = userServices.map(service => service.name);
		console.log(service)
		//console.log(serviceNames)
		//console.log(valticket.service)
		//console.log(userServices.includes(valticket.service))
		if(!service){
						console.log(req.accountId)
						console.log(valticket.userPosted._id.toString())
						console.log(valticket.team)
                        return res.status(400).send({error: "Unauthorized"})
        }
		//const {title, description, team, unit, type} = req.body
		let newStatus = "open"
		// let ticket = null
		const date = Date.now()
		const closedAt = Date.now()
		let payload = {}	
		switch(valticket.status){
			case "Open":
				newStatus = "Acknowledged"
				payload = {status: newStatus,acknowledgedAt: date }
				// ticket = await Ticket.findByIdAndUpdate(req.params.ticketId,
				// {status: newStatus,acceptedAt },
				// {new: true})
				// res.send(ticket)
				break
			case "Acknowledged":
				newStatus = "Investigating"
				payload = {status: newStatus,investigatingAt: date }
				// ticket = await Ticket.findByIdAndUpdate(req.params.ticketId,
				// {status: newStatus,closedAt },
				// {new: true})
				//return res.send(ticket)
				break;
			case "Investigating":
				newStatus = "Resolved"
				payload = {status: newStatus,resolvedAt: date }
				
				break;
			case "Resolved":
				newStatus = "Closed"
				payload = {status: newStatus,closedAt: date }
			
				break;
			case "Closed":
				newStatus = "Closed"
				return res.status(200).send("already closed")
				break;
			

		}
		const ticket = await Ticket.findByIdAndUpdate(req.params.ticketId, payload, {new: true})
			// {status: newStatus, },
			// {new: true})
		return res.send(ticket)
	}catch(err){
		console.log(err)
                res.status(500).json({error: 'failed to update tickets'})
	}
})

module.exports = app => app.use('/tickets', router )
