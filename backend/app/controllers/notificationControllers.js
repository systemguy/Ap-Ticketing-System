// In-app notifications for the logged-in user (the bell in the navbar). The same messages are
// emailed when they're created; see helpers/notify.js.
const express = require('express')
const { isValidObjectId } = require('mongoose')
const Notification = require('../models/notification')
const authMiddleware = require('../middleware/authMiddleWare')

const router = express.Router()
router.use(authMiddleware)

router.param('notificationId', (req, res, next, id) =>
	isValidObjectId(id) ? next() : res.status(404).send({error: 'Notification not found'}))

const toClient = (n) => ({
	_id: n._id,
	type: n.type,
	title: n.title,
	message: n.message,
	ticket: n.ticket ?? null,
	ticketRef: n.ticketRef ?? null,
	service: n.service ?? null,
	severity: n.severity ?? null,
	action: n.action ?? null,
	read: n.read,
	createdAt: n.createdAt,
	email: n.email?.status ?? null,
})

// GET /notifications?limit=50  newest first, plus how many are unread
router.get('/', async (req, res) => {
	try{
		const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
		const [items, unread] = await Promise.all([
			Notification.find({user: req.accountId}).sort({createdAt: -1}).limit(limit),
			Notification.countDocuments({user: req.accountId, read: false}),
		])
		return res.send({notifications: items.map(toClient), unread})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to load notifications'})
	}
})

// GET /notifications/unread-count  for the navbar badge (polled)
router.get('/unread-count', async (req, res) => {
	try{
		return res.send({unread: await Notification.countDocuments({user: req.accountId, read: false})})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to count notifications'})
	}
})

// PATCH /notifications/read-all
router.patch('/read-all', async (req, res) => {
	try{
		const result = await Notification.updateMany({user: req.accountId, read: false}, {$set: {read: true, readAt: new Date()}})
		return res.send({updated: result.modifiedCount, unread: 0})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to update notifications'})
	}
})

// PATCH /notifications/:notificationId/read  only your own
router.patch('/:notificationId/read', async (req, res) => {
	try{
		const n = await Notification.findOneAndUpdate(
			{_id: req.params.notificationId, user: req.accountId},
			{$set: {read: true, readAt: new Date()}},
			{returnDocument: 'after'})
		if(!n){
			return res.status(404).send({error: 'Notification not found'})
		}
		const unread = await Notification.countDocuments({user: req.accountId, read: false})
		return res.send({notification: toClient(n), unread})
	}catch(err){
		console.log(err)
		return res.status(500).send({error: 'Failed to update the notification'})
	}
})

module.exports = app => app.use('/notifications', router)
