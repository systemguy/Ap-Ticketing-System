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
	services:{
		type: [String],
		select: true,
		required: false
	}
})

const team = mongoose.model('Team', TeamScheme)

module.exports = team
