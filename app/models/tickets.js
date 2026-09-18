const mongoose = require('../../database')
const bcrypt = require('bcryptjs')



const TicketScheme= new mongoose.Schema({
	ticketId:{
		type: String,
		required: false,
		select: true,
	},
	userPosted:{
		type:mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
		select: true
	},
	title:{
		type: String,
		required: true,
		select: true
	},
	type:{
		type:String,
		required: true,
		select: true
	},
	description:{
		type: String,
		required: true,
		select: true
	},
	team:{
		type:String,
		ref: 'Team',
		required:  true,
		select: true
	},
	unit:{
		type:String,
		required:  true,
		select: true
	},
	resolved:{
		type: Boolean,
		required: false,
		select: true
	}

})

const ticket = mongoose.model('Ticket', TicketScheme)

module.exports = ticket
