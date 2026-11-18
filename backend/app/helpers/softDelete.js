// Soft deletion (Sprint 5). Nothing is ever removed from the database: a deleted user, team,
// service or ticket is flagged inactive, with who deleted it and when. It disappears from the
// lists people pick from, but stays in history (timelines, analytics, old tickets).
//
// Adds to a schema:
//   active       false once deleted (users already had this field)
//   deletedAt    when it was deleted
//   deletedBy    who deleted it
//   deletionLog  every delete and restore, so a restore doesn't erase the record
//
// Queries use { active: { $ne: false } } so documents saved before this field existed count
// as active.
const mongoose = require('mongoose')

const NOT_DELETED = { active: { $ne: false } }

function softDelete(schema) {
	if (!schema.path('active')) schema.add({ active: { type: Boolean, default: true } })
	schema.add({
		deletedAt: { type: Date },
		deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
		deletionLog: {
			type: [{
				_id: false,
				action: { type: String, enum: ['deleted', 'restored'], required: true },
				by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
				at: { type: Date, required: true },
			}],
			default: undefined,
		},
	})

	// The update that deletes or restores one document, recorded as done by userId
	schema.statics.deletionUpdate = function (userId, deleted, at = new Date()) {
		const entry = { action: deleted ? 'deleted' : 'restored', by: userId, at }
		return deleted
			? { $set: { active: false, deletedAt: at, deletedBy: userId }, $push: { deletionLog: entry } }
			: { $set: { active: true }, $unset: { deletedAt: 1, deletedBy: 1 }, $push: { deletionLog: entry } }
	}
}

module.exports = { softDelete, NOT_DELETED }
