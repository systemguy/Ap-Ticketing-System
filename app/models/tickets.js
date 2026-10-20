const { Timestamp } = require('mongodb')
const mongoose = require('../../database')
const bcrypt = require('bcryptjs')


// One timeline entry. Only the backend writes these, and nobody can edit them.
const EventSchema = new mongoose.Schema({
	// created, status_change, assignment_change, edited, comment (reporter) or note (solver)
	type: { type: String, required: true },
	actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	from: String, // previous status, or previous assignee's name
	to: String, // new status, or new assignee's name
	fields: { type: [String], default: undefined }, // edited: which details changed
	comment: String, // comment or note text
	createdAt: { type: Date, default: Date.now },
})

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
	},
	// Solver who acknowledged the ticket
	assignedTo:{
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false,
		select: true
	},
	// The ticket's timeline: who did what and when, oldest first
	events: [EventSchema]

})


const ticket = mongoose.model('Ticket', TicketScheme)

module.exports = ticket
