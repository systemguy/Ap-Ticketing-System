const cors = require('cors');
const express = require("express")
const bodyParser = require("body-parser")
const path = require("path");
const startEscalationCron = require('./app/helpers/escalateTickets');


const app = express()

app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

require('./app/controllers/index')(app)

startEscalationCron();

app.listen(3000,()=>{
	console.log("Server Running on port 3000")
})

