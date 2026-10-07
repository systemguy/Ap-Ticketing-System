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
		lowercase: true,
		trim: true
	},
	// Optional and not unique: users can sign up without one and add it on the profile page
	bio: {
		type: String,
		required: false,
		trim: true,
		maxlength: [500, 'Bio must be 500 characters or fewer'],
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
	photo: {
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


UserScheme.pre('save', async function(){
	if(this.role == undefined){
		this.role =  "user"
	}
	if(this.team == undefined){
		this.team = "user"
	}
	// Only hash a new or changed password. Without this check, saving a user for any
	// other reason (e.g. updating the bio) would hash the hash and lock them out.
	if(this.isModified('password')){
		this.password = await bcrypt.hash(this.password,10)
	}
})

const user = mongoose.model('User', UserScheme)
module.exports = user
