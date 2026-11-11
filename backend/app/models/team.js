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
	escTime:{
		type: Number,
		default: 5,
		select: true,
		required: false,
	},
	responders:[{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, { timestamps: true })

// TeamScheme.pre('save', async function(){
//     if(this.escTime == undefined){
//         this.escTime = 5
//     }
// })

const team = mongoose.models.team || mongoose.model('team', TeamScheme)

module.exports = team
