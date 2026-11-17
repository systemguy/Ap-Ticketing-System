const mongoose = require('../../database')

// One on-call shift for one team, from start to end. The primary responder gets new tickets
// first; the secondary takes them when the primary already has 3 open incidents.
// People pick a date and a slot; start and end are the real moments (Central time).
const ShiftSchema = new mongoose.Schema({
	team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
	responder: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	// Secondary on call. Shifts made before Sprint 5 don't have one.
	secondary: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
	slot: { type: String, enum: ['morning', 'evening', 'overnight'], required: true },
	date: { type: String, required: true }, // 'YYYY-MM-DD': the Central day the shift starts
	start: { type: Date, required: true },
	end: { type: Date, required: true },
	createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // empty when the seed script made it
}, { timestamps: true })

// A team can't have two shifts starting at the same moment. Lookups go by team or responder and time.
ShiftSchema.index({ team: 1, start: 1 }, { unique: true })
ShiftSchema.index({ responder: 1, start: 1 })
ShiftSchema.index({ secondary: 1, start: 1 })

module.exports = mongoose.model('Shift', ShiftSchema)
