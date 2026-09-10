const mongoose = require('../../database')
const bcrypt = require('bcryptjs')

const UserScheme = new mongoose.Schema({
	name:{
		type: String,
		required: true,
		select: true
	},
	email:{
		type: String,
		required: true,
		unique: true,
		lowercase: true
	},
	password: {
		type: String,
		required: true,
		select: false
	},
	accountId:{
		type: String,
		required: false,
		select: true
	},
	role: {
		type: String,
		required: false,
		select: true,
	},
	team: {
		type: String,
		ref: 'Team',
		required: false,
		select: true
	}


})


UserScheme.pre('save', async function(next){
	if(this.role == undefined){
		this.role =  "user"
	}
	if(this.team == undefined){
		this.team = "user"
	}
	const hash = await bcrypt.hash(this.password,10)
	this.password = hash
})

const user = mongoose.model('User', UserScheme)
module.exports = user
