const express =require("express")
const router  = express.Router()
const user = require('../models/user')
const User = require('../models/user')
const Team = require('../models/team')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const owasp = require('owasp-password-strength-test');
const  authconfig = require('../../config/auth')

function generateToken(params = {}) {
    return jwt.sign(params,authconfig.secret,{
    })
}

router.get('/', async(req, res)=>{
	try{
		const users = await user.find({})
		console.log("TEST")
		return res.status(200).send(users)
	}catch(err){
		console.log(err)
	}

})

router.post('/register/', async(req,res)=>{
	const {email} = req.body
	console.log(req.body)
	try{
		if(await User.findOne({email}))
			return res.status(400).send({error: 'User already exists'})
		var passresult = owasp.test(req.body.password)
		if(passresult.strong == false){
                return res.status(400).send({error: passresult.errors})
               
        }
		const user = await User.create(req.body)
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
	const {title, services} = req.body
	try{
                 if(await Team.findOne({title}))
                        return res.status(400).send({error: 'Team already exists'})
                const team = await Team.create(req.body)
                return res.send(team)
        }catch(err){
                console.log(err)
        }
})

module.exports = app => app.use('/', router)
