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
		return res.send({
			user: publicUser(user),
			token: generateToken({id: user.id, team: user.team})
		})
	}catch(err){
		console.error('Login failed:', err.message)
		return res.status(500).send({error: 'Login failed'})
	}
})
router.post('/register/team', async(req, res)=>{
	const {name} = req.body
	try{
                 if(await Team.findOne({name}))
                        return res.status(400).send({error: 'Team already exists'})
                const team = await Team.create(req.body)
                return res.send(team)
        }catch(err){
                console.log(err)
        }
})
router.post('/register/services', async(req, res)=>{
	const {name, teamId} = req.body
	try{
                 if(await Service.findOne({name}))
                        return res.status(400).send({error: 'Service already exists'})
				 if(await !Service.findOne({teamId}))
						return res.status(400).send({error: 'Team does not exist'})
                const service = await Service.create(req.body)
                return res.send(service)
        }catch(err){
                console.log(err)
        }
})

module.exports = app => app.use('/', router)
