const express =require("express")
const router  = express.Router()
const User = require('../models/user')
const Team = require('../models/team')
const Service = require('../models/services')
const bcrypt = require('bcryptjs')
const multer = require('multer')
const jwt = require('jsonwebtoken')
const owasp = require('owasp-password-strength-test');
const authconfig = require('../../config/auth')
const path = require('path');
const fs = require('fs')
const crypto = require('crypto')

const Post = require('../models/post')
const authMiddleware = require('../middleware/authMiddleWare')
const { publicUser } = require('../helpers/users')

// Long passphrases must still include upper/lowercase, a number and a symbol (Sprint 1 rule)
owasp.config({ allowPassphrases: false })

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Profile pictures: images only, 2 MB max, saved under a random name whose
// extension comes from the file type (never from the uploaded file name)
const UPLOAD_DIR = path.join(__dirname, '../../uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })
const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + IMAGE_TYPES[file.mimetype]),
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    IMAGE_TYPES[file.mimetype] ? cb(null, true) : cb(new Error('Profile picture must be a PNG, JPEG, GIF or WebP image')),
});

// Runs the upload and answers with a clear 400 when the file is rejected
function avatarUpload(req, res, next) {
  upload.single('avatar')(req, res, (err) => {
    if (!err) return next()
    const error = err.code === 'LIMIT_FILE_SIZE' ? 'Profile picture must be 2 MB or smaller' : err.message
    return res.status(400).send({ error })
  })
}

// Deletes a saved upload when registration fails, so rejected signups leave no files behind
function discardUpload(req) {
  if (req.file) fs.promises.unlink(req.file.path).catch(() => {})
}

function generateToken(params = {}) {
    return jwt.sign(params, authconfig.secret, { expiresIn: authconfig.expiresIn })
}


router.post('/register/', avatarUpload, async(req,res)=>{
	// Only these fields are accepted from the client. role and team are never read
	// from the request body, so nobody can sign themselves up onto a staff team.
	const {name, email, password, bio} = req.body
	const reject = (error) => {
		discardUpload(req)
		return res.status(400).send({error})
	}
	if(typeof name !== 'string' || !name.trim())
		return reject('Name is required')
	if(typeof email !== 'string' || !EMAIL_FORMAT.test(email.trim()))
		return reject('Please enter a valid email address')
	if(typeof password !== 'string')
		return reject('Password is required')
	if(bio !== undefined && typeof bio !== 'string')
		return reject('Bio must be text')
	try{
		const normalizedEmail = email.trim().toLowerCase()
		if(await User.findOne({email: normalizedEmail}))
			return reject('User already exists')
		const passresult = owasp.test(password)
		if(!passresult.strong)
			return reject(passresult.errors)

		let photo = ''
		if(req.file){
			photo = `uploads/${req.file.filename}`
			await Post.create({
				name: req.file.originalname,
				size: req.file.size,
				key: req.file.filename,
				url: ''
			})
		}

		const user = await User.create({name: name.trim(), email: normalizedEmail, password, bio, photo})
		return res.send({
			user: publicUser(user),
			token: generateToken({id: user.id, team: user.team})
		})
	}catch(err){
		discardUpload(req)
		if(err.code === 11000)
			return res.status(400).send({error: 'User already exists'})
		if(err.name === 'ValidationError')
			return res.status(400).send({error: Object.values(err.errors).map(e => e.message)})
		console.error('Register failed:', err.message)
		return res.status(500).json({ error: 'Failed to register user' })
	}
})

router.post('/login/', async(req, res)=>{
	const {email, password} = req.body
	// Strings only: blocks query-operator payloads like {"email": {"$ne": null}}
	if(typeof email !== 'string' || typeof password !== 'string')
		return res.status(400).send({error: 'Email and password are required'})
	try{
		const user = await User.findOne({email: email.trim().toLowerCase()}).select('+password')
		if(!user || !await bcrypt.compare(password, user.password))
			return res.status(400).send({error: 'Invalid email or password'})
		// An administrator deactivated this account (soft delete)
		if(user.active === false)
			return res.status(403).send({error: 'This account has been deactivated. Contact building management.'})
		return res.send({
			user: publicUser(user),
			token: generateToken({id: user.id, team: user.team})
		})
	}catch(err){
		console.error('Login failed:', err.message)
		return res.status(500).send({error: 'Login failed'})
	}
})
// Only admins can create teams and services (these used to be open to anyone)
async function adminOnly(req, res, next){
	try{
		const me = await User.findById(req.accountId).select('role active')
		if(me?.role !== 'admin' || me.active === false)
			return res.status(403).send({error: 'Only administrators can set up teams and services'})
		return next()
	}catch(err){
		console.error('Admin check failed:', err.message)
		return res.status(500).send({error: 'Could not check your account'})
	}
}

// Body: { name }. Pick the lead later in the admin portal.
router.post('/register/team', authMiddleware, adminOnly, async(req, res)=>{
	const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
	if(!name)
		return res.status(400).send({error: 'Team name is required'})
	try{
		if(await Team.findOne({name}))
			return res.status(400).send({error: 'Team already exists'})
		const team = await Team.create({name})
		return res.send(team)
	}catch(err){
		console.error('Create team failed:', err.message)
		return res.status(500).send({error: 'Failed to create the team'})
	}
})

// Body: { name, teamId } where teamId is the team's name (optional)
router.post('/register/services', authMiddleware, adminOnly, async(req, res)=>{
	const name = typeof req.body?.name === 'string' ? req.body.name.trim().toLowerCase() : ''
	const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId.trim() : ''
	if(!name)
		return res.status(400).send({error: 'Service name is required'})
	try{
		if(await Service.findOne({name}))
			return res.status(400).send({error: 'Service already exists'})
		if(teamId && !await Team.exists({name: teamId}))
			return res.status(400).send({error: 'Team does not exist'})
		const service = await Service.create(teamId ? {name, teamId} : {name})
		return res.send(service)
	}catch(err){
		console.error('Create service failed:', err.message)
		return res.status(500).send({error: 'Failed to create the service'})
	}
})

module.exports = app => app.use('/', router)
