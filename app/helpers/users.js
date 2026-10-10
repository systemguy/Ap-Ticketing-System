// Never send the password hash (or Mongo's __v) back to the client
function publicUser(user) {
	const { password, __v, ...rest } = user.toObject()
	return rest
}

module.exports = { publicUser }
