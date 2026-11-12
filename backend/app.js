const cors = require('cors');
const path = require('path')
const express = require("express")
const { recordRequests, startHeartbeat, health } = require('./app/helpers/metrics')

const app = express()

app.use(cors())
// Ticket photos are sent inside the request, so allow a few MB
app.use(express.json({limit: '4mb'}))
app.use(express.urlencoded({extended: false}))

// Is the server up? No login needed
app.get('/health', (req, res) => {
	const h = health()
	res.status(h.status === 'ok' ? 200 : 503).send(h)
})

// Time every request (for the Performance page)
app.use(recordRequests)

// Profile pictures uploaded at signup
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {fallthrough: false}))

require('./app/controllers/index')(app)

// Escalate tickets nobody has acknowledged (every 30 seconds)
require('./app/helpers/escalation').startEscalationTimer()
// Heartbeat for uptime tracking (every 30 seconds)
startHeartbeat()

const PORT = Number(process.env.PORT || 3000)
app.listen(PORT,()=>{
	console.log(`Server Running on port ${PORT}`)
})
