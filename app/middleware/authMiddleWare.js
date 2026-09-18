const jwt = require('jsonwebtoken');
// #Dayan I switched this from config/auth.json to config/auth.js, which
// reads the secret from .env.
const authConfig = require('../../config/auth');

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

    jwt.verify(token, authConfig.secret, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: 'Invalid or expired token' });
        }

        req.accountId = decoded.id;
	    req.team = decoded.team
        return next();
    });
};
