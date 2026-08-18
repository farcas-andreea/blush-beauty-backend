const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

function creeazaToken(user) {
    return jwt.sign(
        { id: user.id, rol: user.rol, nume: user.nume, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
}

// POST /api/auth/inregistrare
// Inregistrare publica -> intotdeauna cu rolul 'client'.
// Conturile de admin/angajat sunt create de un admin din panoul de administrare.
const inregistrare = asyncHandler(async (req, res) => {
    const { nume, email, parola, telefon } = req.body;

    if (!nume || !email || !parola) {
        return res.status(400).json({ mesaj: 'Nume, email si parola sunt obligatorii.' });
    }
    if (parola.length < 6) {
        return res.status(400).json({ mesaj: 'Parola trebuie sa aiba cel putin 6 caractere.' });
    }

    const parolaHash = await bcrypt.hash(parola, 10);

    const { rows } = await query(
        `INSERT INTO users (nume, email, parola_hash, telefon, rol)
         VALUES ($1, $2, $3, $4, 'client')
         RETURNING id, nume, email, telefon, rol, creat_la`,
        [nume, email, parolaHash, telefon || null]
    );

    const user = rows[0];
    const token = creeazaToken(user);
    res.status(201).json({ user, token });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
    const { email, parola } = req.body;
    if (!email || !parola) {
        return res.status(400).json({ mesaj: 'Email si parola sunt obligatorii.' });
    }

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const userDb = rows[0];

    if (!userDb || !userDb.activ) {
        return res.status(401).json({ mesaj: 'Email sau parola incorecta.' });
    }

    const parolaCorecta = await bcrypt.compare(parola, userDb.parola_hash);
    if (!parolaCorecta) {
        return res.status(401).json({ mesaj: 'Email sau parola incorecta.' });
    }

    const user = {
        id: userDb.id,
        nume: userDb.nume,
        email: userDb.email,
        telefon: userDb.telefon,
        rol: userDb.rol
    };
    const token = creeazaToken(user);
    res.json({ user, token });
});

// GET /api/auth/eu -> profilul utilizatorului autentificat curent
const profilCurent = asyncHandler(async (req, res) => {
    const { rows } = await query(
        'SELECT id, nume, email, telefon, rol, creat_la FROM users WHERE id = $1',
        [req.user.id]
    );
    if (!rows[0]) {
        return res.status(404).json({ mesaj: 'Utilizator inexistent.' });
    }
    res.json(rows[0]);
});

module.exports = { inregistrare, login, profilCurent };
