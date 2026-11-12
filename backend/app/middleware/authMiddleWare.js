const jwt = require('jsonwebtoken');
// #Dayan I switched this from config/auth.json to config/auth.js, which
// reads the secret from .env.
const authConfig = require('../../config/auth');
const User = require('../models/user');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send({ error: 'No token provided' });
    }

    const parts = authHeader.split(' ');

    // Fixed length check logic:
    if (parts.length !== 2) {
        return res.status(401).send({ error: 'Token format error' });
    }

    const [scheme, token] = parts;

    if (!/^Bearer$/i.test(scheme)) {
        return res.status(401).send({ error: 'Malformatted token scheme' });
    }

    jwt.verify(token, authConfig.secret, async (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: 'Invalid or expired token' });
        }
        try {
            // Check the account on every request, so a deactivated account is locked out
            // right away and team changes apply without logging out.
            const account = await User.findById(decoded.id).select('team active');
            if (!account) {
                return res.status(401).send({ error: 'Account not found. Please log in again.' });
            }
            // 401 makes the frontend log them out
            if (account.active === false) {
                return res.status(401).send({ error: 'This account has been deactivated. Contact building management.' });
            }
            req.accountId = decoded.id;
            req.team = account.team ?? decoded.team;
            return next();
        } catch (lookupErr) {
            console.error('Auth check failed:', lookupErr.message);
            return res.status(500).send({ error: 'Could not check your login' });
        }
    });
};
