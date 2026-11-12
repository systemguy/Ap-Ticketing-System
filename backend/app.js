const cors = require('cors');
const path = require('path')
const express = require("express")
const { recordRequests, startHeartbeat, health } = require('./app/helpers/metrics')

const app = express()

app.use(cors())
// Ticket photos arrive as compressed data URLs, so allow a few MB
app.use(express.json({limit: '4mb'}))
app.use(express.urlencoded({extended: false}))

// Up and reachable? No login needed, for uptime monitors and the deploy check
app.get('/health', (req, res) => {
	const h = health()
	res.status(h.status === 'ok' ? 200 : 503).send(h)
})

// Times every request (Sprint 4 requirement change: speed)
app.use(recordRequests)

// Profile pictures saved by the signup form (backend/uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {fallthrough: false}))

require('./app/controllers/index')(app)

// Escalates unacknowledged tickets under each team's escalation policy, every 30 seconds
require('./app/helpers/escalation').startEscalationTimer()
// Writes a heartbeat every 30 seconds; minutes without one count as downtime
startHeartbeat()

const PORT = Number(process.env.PORT || 3000)
app.listen(PORT,()=>{
	console.log(`Server Running on port ${PORT}`)
})
