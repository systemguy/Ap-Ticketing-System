// config/auth.js
// Author: Dayan Kijege

// #Dayan I keep the secret in .env so it never gets pushed to GitHub.
const secret = process.env.JWT_SECRET

// #Dayan If the secret is missing I stop the server right here. Without it,
// tokens get signed with "undefined" and anyone could fake a login.
if (!secret) {
  throw new Error('JWT_SECRET is not set. Start the server with: npm start')
}

module.exports = {
  secret,
  // #Dayan I set logins to last 24 hours.
  expiresIn: '24h',
}
