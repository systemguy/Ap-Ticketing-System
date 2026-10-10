const cors = require('cors');
const express = require("express")
const bodyParser = require("body-parser")


const app = express()

app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))
require('./app/controllers/index')(app)

app.listen(3000,()=>{
	console.log("Server Running on port 3000")
})

