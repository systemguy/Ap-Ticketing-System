const cors = require('cors');
const express = require("express")
const bodyParser = require("body-parser")


const app = express()

app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))
require('./app/controllers/index')(app)

// Escalates unacknowledged tickets under each team's escalation policy, once a minute
require('./app/helpers/escalation').startEscalationTimer()

app.listen(3000,()=>{
	console.log("Server Running on port 3000")
})

