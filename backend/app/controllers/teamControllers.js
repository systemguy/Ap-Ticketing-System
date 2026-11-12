// Teams and their leads. "Who leads team X" is a single lookup on the team.
const express = require('express')
const Team = require('../models/team')
const authMiddleware = require('../middleware/authMiddleWare')
const Ticket = require('../models/tickets')
const User = require('../models/user')
const Service = require('../models/services')

const router = express.Router()
router.use(authMiddleware)

router.get('/', async(req, res) =>{
	try{
		const teams = await Team.find().sort({name: 1}).populate('lead', 'name')
		return res.send({teams: teams.map(t => ({
			_id: t._id,
			name: t.name,
			lead: t.lead ? {_id: t.lead._id, name: t.lead.name} : null,
		}))})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to load teams'})
	}
})

router.patch('/escalation/:teamId', async (req, res) => {
    try {
        const team = await Team.findOne({name: req.params.teamId});

        if (!team) {
            return res.status(404).json({ error: 'Team not found.' });
        }

        // Use .equals() for safe ObjectId comparison between team.lead and req.accountId
        if (!team.lead?.equals(req.accountId)) {
            return res.status(403).json({ error: 'Unauthorized: Only the team lead can update escalation settings.' });
        }

        const { responders, escTime } = req.body;

        // Update fields if provided in request body
        if (responders !== undefined) team.responders = responders;
      
        if (escTime !== undefined) team.escTime = escTime;

        await team.save();

        return res.status(200).json({
            message: 'Escalation settings updated successfully.',
            team
        });

    } catch (error) {
        console.error('[PATCH /escalation/:teamId] Error:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

router.get('/escalation/:teamId', async (req, res) => {
    try {

        const { teamId } = req.params;
        const currentUserId = req.accountId;

        const team = await Team.findOne({name: teamId})
            .populate('lead', 'name email')
            .populate('responders', 'name email');

        if (!team) {
            return res.status(404).json({ error: 'Team not found.' });
        }

        const isLead = team.lead?._id?.equals(currentUserId) || team.lead?.equals(currentUserId);
        const isAdmin = req.user?.role === 'admin';
        const canEdit = isLead || isAdmin;
        const responders = Array.isArray(team.responders) ? team.responders : [];
        const baseEscTime = team.escTime ?? 5;

        const candidates = await User.find({ team: teamId }).select('name email role');

        const levels = responders.map((responder, index) => ({
            level: index,
            assignTo: 'person',
            person: responder,
            after: {
                low: baseEscTime * 4,       // Sev 1 multiplier (4x)
                moderate: baseEscTime * 3,  // Sev 2 multiplier (3x)
                high: baseEscTime * 2,      // Sev 3 multiplier (2x)
                critical: baseEscTime * 1   // Sev 4 multiplier (1x)
            },
            now: index === 0,
            nobody: false
        }));

        levels.push({
            level: responders.length,
            assignTo: 'lead',
            person: team.lead ?? null,
            after: {
                low: baseEscTime * 4,
                moderate: baseEscTime * 3,
                high: baseEscTime * 2,
                critical: baseEscTime * 1
            },
            now: false,
            nobody: !team.lead
        });

        // 5. Fetch active tickets associated with this team's services
        const services = await Service.find({ 
            $or: [{ teamId: team._id }, { teamId: team.teamId }, { name: team.name }] 
        }).select('name');
        
        const serviceNames = services.map(s => s.name);

        const tickets = await Ticket.find({
            service: { $in: serviceNames },
            resolved: false
        })
        .select('-events')
        .populate('userPosted', 'name email')
        .populate('assignedTo', 'name email');

        // 6. Assemble policy object
        const policy = {
            enabled: true,
            levels,
            updatedAt: team.updatedAt,
            updatedBy: team.lead ?? null
        };

        // 7. System defaults & limits
        const defaults = {
            escTime: 5,
            severityMultipliers: { low: 4, moderate: 3, high: 2, critical: 1 }
        };

        const limits = {
            maxLevels: 10,
            minEscTime: 1,
            maxEscTime: 1440
        };

        // Return exact shape required by frontend
        return res.status(200).json({
            team,
            canEdit,
            policy,
            defaults,
            limits,
            candidates,
            tickets
        });
        // // Use .equals() for safe ObjectId comparison between team.lead and req.accountId
        // if (!team.lead?.equals(req.accountId)) {
        //     return res.status(403).json({ error: 'Unauthorized: Only the team lead can update escalation settings.' });
        // }

        // const { responder, escTime } = req.body;

        // // Update fields if provided in request body
        // if (responder !== undefined) team.responder = responder;
      
        // if (escTime !== undefined) team.escTime = escTime;

        // await team.save();

        //const levels = team.responders.length +1

        return res.status(200).json({
            message: 'Escalation settings updated successfully.',
            team
        });

    } catch (error) {
        console.error('[GET /escalation/:teamId] Error:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});


module.exports = app => app.use('/teams', router)
