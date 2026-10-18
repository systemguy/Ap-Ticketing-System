const mongoose = require('../../database')
const bcrypt = require('bcryptjs')


const TeamScheme = new mongoose.Schema({

	teamId:{
		type: String,
		required: false,
		select: true,
	},
	name:{
		type: String,
		unique: true,
		select: true,
		required:true
	},
	// The responder who leads this team and manages its schedule. "Who leads team X" is one lookup.
	lead:{
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false,
		select: true,
	},
}, { timestamps: true })

const team = mongoose.model('Team', TeamScheme)

module.exports = team
