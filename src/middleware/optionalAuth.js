const jwt = require('jsonwebtoken');

// La fel ca authenticate, dar nu blocheaza cererea daca nu exista token.
// Util pentru rute publice care se comporta usor diferit pentru useri logati.
function optionalAuth(req, res, next) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        try {
            req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
        } catch (err) {
            // token invalid -> tratam cererea ca neautentificata, fara eroare
        }
    }
    next();
}

module.exports = { optionalAuth };
