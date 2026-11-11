const cron = require("node-cron") 
const Ticket = require('../models/tickets')
const Shift = require('../models/shift');
const Service = require('../models/services');
const Team = require('../models/team')
const User = require('../models/user')
const nodemailer = require("nodemailer");
const ticketControllers = require("../controllers/ticketControllers");




async function escalateStaleTickets(){
    try{


        const transporter = nodemailer.createTransport({
        host: "smtp-relay.brevo.com",
        port: 587,
        secure: false, // use STARTTLS (upgrade connection to TLS after connecting)
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
            },
        });
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const  thirtyMinutesAgo =  new Date(Date.now() - 30 * 60 * 1000);
        const  fifteenMinutesAgo =  new Date(Date.now() - 15 * 60 * 1000);
        const  tenMinutesAgo =  new Date(Date.now() - 10 * 60 * 1000);
        const now = new Date();
        const staleTickets = await Ticket.find({
            $or: [{status: 'Open'},{status: 'Escalated'}],
            resolved: false,
            $expr: {
                $lte: [
                    '$createdAt',
                    {
                        $subtract: [
                            new Date(),
                            {
                                $multiply: [
                                    { $ifNull: ['$escTime', 5] }, // Use ticket.escTime or default to 5
                                    {
                                        $switch: { // Multipliers based on severity
                                            branches: [
                                                { case: { $eq: ['$severity', 4] }, then: 1 },
                                                { case: { $eq: ['$severity', 3] }, then: 2 },
                                                { case: { $eq: ['$severity', 2] }, then: 3 },
                                                { case: { $eq: ['$severity', 1] }, then: 4 }
                                            ],
                                            default: 1
                                        }
                                    },
                                    60, // Convert minutes to seconds
                                    1000 // Convert seconds to milliseconds
                                ]
                            }
                        ]
                    }
                ]
            }
            
        });
        if(staleTickets.length ===0 ) return;
        console.log(`[Cron] Found ${staleTickets.length} stale ticket(s) to process.`);

        
        for(const ticket of staleTickets){
            //console.log(await Service.findOne({name: ticket.service}))
            const serviceExists = ticket.service && await Service.findOne({ name: ticket.service });
            if(!serviceExists){
                console.warn(`[Cron] Skipping ticket ${ticket._id}: Service '${ticket.service}' not found.`);
                continue; // Skip to the next ticket in the loop
		    }
            
            const team = await Team.findOne({ $or: [{ teamId: serviceExists.teamId }, { name: serviceExists.teamId }] })
            //const assignedTo = team.firstResponder ?? team.secondResponder ?? team.lead
            // Define explicit override target by escLevel
        //     const levelMap = {
        //     0: team.firstResponder,
        //     1: team.secondResponder,
        //     3: team.lead
        //     };

        //     // Select explicit match based on escLevel if available, otherwise fall back sequentially
        //     const assignedTo = levelMap[ticket.escLevel] ?? team.firstResponder ?? team.secondResponder ?? team.lead;
        //     //const assignedTo = team.lead
        //    // console.log(assignedTo)
            // 1. Check if a responder exists at index `escLevel`
            let assignedTo = null
            if (Array.isArray(team.responders) && team.responders[team.escLevel]) {
                assignedTo =  team.responders[escLevel];
            }else{
                assignedTo = team.lead ?? null;
            }

            // 2. If escLevel goes beyond the array length, fall back to team lead
             

            const resolver = await User.findById(assignedTo)
            if(!ticket.assignedTo?.equals(assignedTo)){
                console.log('assignedTo:' + assignedTo)
                console.log('ticket assignedTo: ' + ticket.assignedTo)
                const resolverEmail = resolver.email
                const mailOptions = {
                    from: 'pavila2@stedwards.edu',
                    to: resolverEmail,
                    subject: 'Ticket Escalated and assigned to you',
                    text: `Ticket ${ticket._id} named ${ticket.title} was assigned to you`
                    };  

                const reporterMailOptions = {
                    from: 'pavila2@stedwards.edu',
                    to: resolverEmail,
                    subject: 'Ticket Escalated and assigned',
                    text: `your ticket ${ticket._id} named ${ticket.title} was stale, to prevent your problem to remains unresolved, we escalated it to a more capacitaded responder`
                    };  
                transporter.sendMail(mailOptions, function(error, info){
                        if (error) {
                            console.log(error);
                        } else {
                            console.log('Email sent: ' + info.response);
                        }
                }); 
                transporter.sendMail(reporterMailOptions, function(error, info){
                        if (error) {
                            console.log(error);
                        } else {
                            console.log('Email sent: ' + info.response);
                        }
                }); 
                 const updated = await Ticket.findByIdAndUpdate(
                    ticket._id,
                    { 
                        $set: { 
                            assignedTo, 
                            status: 'Escalated' ,
                           
                        },
                        $inc: { 
                            escLevel: 1 // Atomically increments escLevel by 1 (0 -> 1 -> 2 -> 3)
                        },
                        $push: {
                            events: {
                                type: 'escalated',
                                actor: null, // System event
                                createdAt: Date.now(),
                                note: 'Auto-escalated to Level ${nextEscLevel}'
                            }
                        }
                    },
                    { new: true }
                );
                console.log(`[Cron] Ticket ${ticket._id} ${ticket.title} escalated to lead: ${team.lead}`);
            }
        
           
            
        }
    }catch(err){    
        console.log(err)
    }
}

function startEscalationCron() {
    cron.schedule('* * * * *', () => {
        console.log('[Cron] Checking for stale tickets...');
        escalateStaleTickets();
    });
}

module.exports = startEscalationCron;