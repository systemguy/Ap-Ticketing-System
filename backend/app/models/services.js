const mongoose = require('../../database')
const { softDelete } = require('../helpers/softDelete')
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

// Deleting only flags it (see helpers/softDelete.js)
ServicesScheme.plugin(softDelete)

const services = mongoose.model('Services', ServicesScheme)

module.exports = services
