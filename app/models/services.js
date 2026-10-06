const mongoose = require('../../database')
const bcrypt = require('bcryptjs')


const ServicesScheme = new mongoose.Schema({
    
 
    teamId:{
        type: String,
        required: true,
        ref: 'Team',
        select: true,
    },
    name:{
        type: String,
        unique: true,
        select: true,
        required:true
    }
  
})

const services = mongoose.model('Services', ServicesScheme)

module.exports = services
