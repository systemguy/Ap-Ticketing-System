// Gives an existing account the admin (or auditor) role. There is deliberately no way to become
// an admin or auditor from the website. Once you have one admin, the admin portal can change
// other accounts' roles too.
//
//   node --env-file=.env scripts/make-admin.js someone@example.com
//   node --env-file=.env scripts/make-admin.js someone@example.com --auditor   (read-only auditor)
//   node --env-file=.env scripts/make-admin.js someone@example.com --remove    (back to a normal account)
const mongoose = require('../database')
const User = require('../app/models/user')

async function main() {
	const email = process.argv[2]?.trim().toLowerCase()
	const remove = process.argv.includes('--remove')
	const auditor = process.argv.includes('--auditor')
	if (!email || email.startsWith('--')) throw new Error('Usage: node --env-file=.env scripts/make-admin.js someone@example.com [--auditor | --remove]')
	const user = await User.findOne({ email })
	if (!user) throw new Error(`No account uses ${email}. Register it on the website first.`)
	if (user.active === false) throw new Error(`${email} is deleted. Restore it in the admin portal first.`)
	const staff = Boolean(user.team) && user.team !== 'user'
	// Auditors only read, so they can't be on a team that works incidents
	if (auditor && staff) throw new Error(`${user.name} is on ${user.team}. Move them off the team first (admin portal).`)
	// Staff keep their "solver" role when the admin role is removed; everyone else goes back to "user"
	const role = remove ? (staff ? 'solver' : 'user') : auditor ? 'auditor' : 'admin'
	await User.updateOne({ _id: user._id }, { $set: { role } })
	console.log(`${user.name} (${email}) is now ${role === 'admin' || role === 'auditor' ? `an ${role}` : `a ${role}`}.`)
}

main()
	.catch((err) => {
		console.error(err.message)
		process.exitCode = 1
	})
	.finally(() => mongoose.disconnect())
