const { Timestamp } = require('mongodb')
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
	userComment:{
		type: String,
		required: false,
		select: true
	},
	solverComment:{
		type: String,
		required: false,
		select: true
	},
	severity:{
		type: Number,
		required: true,
		select: true
	},
	service: {
		type: String,
		ref: 'Service',
		required: true,
		select: true
	},
	status:{
		type: String,
		required: true,
		select: true
	},
	createdAt:{
		type: Date,
		required: true,
		select: true
	},
	acknowledgedAt:{
		type: Date,
		required:false,
		select: true
	},
	investigatingAt:{
		type: Date,
		required: false,
		select: true
	},
	resolvedAt:{
		type: Date,
		required: false,
		select: true
	},
	closedAt:{
		type: Date,
		required: false,
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
