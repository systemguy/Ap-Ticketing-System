// Gives an existing account the admin role, so it can open the admin portal.
// There is deliberately no way to become an admin from the website.
//
//   node --env-file=.env scripts/make-admin.js someone@example.com
//   node --env-file=.env scripts/make-admin.js someone@example.com --remove   (back to a normal account)
const mongoose = require('../database')
const User = require('../app/models/user')

async function main() {
	const email = process.argv[2]?.trim().toLowerCase()
	const remove = process.argv.includes('--remove')
	if (!email || email.startsWith('--')) throw new Error('Usage: node --env-file=.env scripts/make-admin.js someone@example.com [--remove]')
	const user = await User.findOne({ email })
	if (!user) throw new Error(`No account uses ${email}. Register it on the website first.`)
	// Staff keep their "solver" role when the admin role is removed; everyone else goes back to "user"
	const role = remove ? (user.team && user.team !== 'user' ? 'solver' : 'user') : 'admin'
	await User.updateOne({ _id: user._id }, { $set: { role } })
	console.log(`${user.name} (${email}) is now ${role === 'admin' ? 'an admin' : `a ${role}`}.`)
}

main()
	.catch((err) => {
		console.error(err.message)
		process.exitCode = 1
	})
	.finally(() => mongoose.disconnect())
