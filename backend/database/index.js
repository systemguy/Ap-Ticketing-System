// database/index.js
// Original by Paulo Avila. Modified by Dayan Kijege.
require('dotenv').config()
global.crypto = require('crypto').webcrypto
const mongoose = require('mongoose')

// #Dayan I moved our connection string to .env. It used to be written right
// here in plain text, and our GitHub repo is public.
const uri = process.env.MONGODB_URI

// #Dayan If the URI is missing I stop the server, so we get a clear message
// instead of a confusing timeout later on.
if (!uri) {
  throw new Error('MONGODB_URI is not set. Start the server with: npm start')
}

mongoose.connect(uri)
mongoose.Promise = global.Promise

module.exports = mongoose
