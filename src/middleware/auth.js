const jwt = require('jsonwebtoken');

// Verifica prezenta si validitatea token-ului JWT trimis in header-ul Authorization.
function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ mesaj: 'Acces neautorizat. Token lipsa.' });
    }

    const token = header.split(' ')[1];
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload; // { id, rol, nume, email }
        next();
    } catch (err) {
        return res.status(401).json({ mesaj: 'Token invalid sau expirat.' });
    }
}

// Restrictioneaza accesul la un set de roluri, ex: authorize('admin', 'angajat')
function authorize(...roluriPermise) {
    return (req, res, next) => {
        if (!req.user || !roluriPermise.includes(req.user.rol)) {
            return res.status(403).json({ mesaj: 'Nu ai permisiunea sa accesezi aceasta resursa.' });
        }
        next();
    };
}

module.exports = { authenticate, authorize };
