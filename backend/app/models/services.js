const mongoose = require('../../database')
const bcrypt = require('bcryptjs')


const ServicesScheme = new mongoose.Schema({
    
 
    teamId:{
        type: String,
        // Empty for a service no team owns yet. Its tickets can't be auto-assigned.
        required: false,
        ref: 'Team',
        select: true,
    },
    name:{
        type: String,
        unique: true,
        select: true,
        required:true
    }
  
}, { timestamps: true })

const services = mongoose.model('Services', ServicesScheme)

module.exports = services
