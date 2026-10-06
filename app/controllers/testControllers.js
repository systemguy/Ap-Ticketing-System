const express =require("express")
const router  = express.Router()
const user = require('../models/user')
const User = require('../models/user')
const Team = require('../models/team')
const Service = require('../models/services')
const bcrypt = require('bcryptjs')
const multer = require('multer')
const jwt = require('jsonwebtoken')
const owasp = require('owasp-password-strength-test');
const authconfig = require('../../config/auth')
const path = require('path');
const crypto = require('crypto')

const Post = require('../models/post')


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Directory where images are saved
  },
  filename: (req, file, cb) => {
    // Extract file extension (.png, .jpg, etc.)
    const ext = path.extname(file.originalname);
    
    // Generate unique random name + original extension
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({storage});

function generateToken(params = {}) {
    return jwt.sign(params,authconfig.secret,{
    })
}



router.post('/register/',upload.single("avatar"), async(req,res)=>{
	const {email} = req.body
	console.log(req.body)
	try{
		if(await User.findOne({email}))
			return res.status(400).send({error: 'User already exists'})
		var passresult = owasp.test(req.body.password)
		if(passresult.strong == false){
                return res.status(400).send({error: passresult.errors})
               
        }
		if(req.file != undefined){
			 const post = await Post.create({
							name: req.file.originalname,
							size: req.file.size,
							key: req.file.filename,
							photo: req.file.path,
							url: ''
						})
			 req.body.photo = req.file.path;
			//  const user = await User.create(req.body)
			//  user.photo = req.file.path
		}
		else {
            // Provide a default string or null value if no file is uploaded
            req.body.photo = ''; 
        }
		const user = await User.create(req.body)
		// user.photo = req.file.path
		
		return res.send({
			user,
			token: generateToken({id: user.id, team: user.team}, "Stack",{
				expiresIn: '24h'
				})
			})
	}catch(err){
		console.log(err)
		return res.status(500).json({ error: 'Failed to register user' })
	}

})

router.post('/login/', async(req, res)=>{
	const {email, password} = req.body
	//console.log(req.body)
	try{
		const user = await User.findOne({email}).select('+password')
		if(!user){
			console.log('Invalid username and passsword')
			return res.status(400).send({error: 'Invalid username and passsword'})
		}
		if(!await bcrypt.compare(password,user.password)){
			console.log('Invalid username and passsword')
			return res.status(400).send({error: 'Invalid username and passsword'})
		}
		user.password = undefined
		console.log(user)
		
		return res.send({
                        user,
                        token: generateToken({id: user.id, team: user.team}, "Stack",{
                                expiresIn: '24h'
                                })
                        })
	}catch(err){
		console.log(err)
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
