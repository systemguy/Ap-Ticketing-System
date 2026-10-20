const mongoose = require('../../database')
const bcrypt = require('bcryptjs')
   




const PostSchema= new mongoose.Schema({
    name: String,
    size: Number,
    key: String,
    url: String,
    createdAt:{
        type: Date,
        default: Date.now,
    },
    
})

module.exports = mongoose.model('Post', PostSchema)