const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/clienti?cautare=... (admin, angajat) -> lista clientilor, cu cautare dupa nume/email/telefon
const listaClienti = asyncHandler(async (req, res) => {
    const { cautare } = req.query;
    const params = [];
    let where = "WHERE rol = 'client'";
    if (cautare) {
        params.push(`%${cautare}%`);
        where += ` AND (nume ILIKE $${params.length} OR email ILIKE $${params.length} OR telefon ILIKE $${params.length})`;
    }
    const { rows } = await query(
        `SELECT id, nume, email, telefon, note, activ, creat_la FROM users ${where} ORDER BY nume`,
        params
    );
    res.json(rows);
});

// GET /api/clienti/:id -> detaliu + istoric programari + total cheltuit
const detaliuClient = asyncHandler(async (req, res) => {
    const { rows } = await query(
        "SELECT id, nume, email, telefon, note, activ, creat_la FROM users WHERE id = $1 AND rol = 'client'",
        [req.params.id]
    );
    const client = rows[0];
    if (!client) return res.status(404).json({ mesaj: 'Clientul nu a fost gasit.' });

    const { rows: istoric } = await query(
        `SELECT p.id, p.inceput, p.sfarsit, p.status, p.pret_final,
                s.nume AS serviciu_nume, ua.nume AS angajat_nume
         FROM programari p
         JOIN servicii s ON s.id = p.serviciu_id
         JOIN angajati a ON a.id = p.angajat_id
         JOIN users ua ON ua.id = a.user_id
         WHERE p.client_id = $1
         ORDER BY p.inceput DESC`,
        [req.params.id]
    );

    const totalCheltuit = istoric
        .filter((p) => p.status === 'finalizata')
        .reduce((suma, p) => suma + Number(p.pret_final || 0), 0);

    res.json({ ...client, istoric, total_cheltuit: totalCheltuit });
});

// POST /api/clienti (admin, angajat) -> inregistreaza rapid un client nou (ex: rezervare telefonica)
const creeazaClient = asyncHandler(async (req, res) => {
    const { nume, email, telefon, note } = req.body;
    if (!nume || !email) {
        return res.status(400).json({ mesaj: 'Nume si email sunt obligatorii.' });
    }
    // client adaugat de personal, fara parola aleasa -> parola temporara aleatoare;
    // clientul o poate reseta ulterior daca vrea sa se autentifice online
    const parolaTemporara = crypto.randomBytes(12).toString('hex');
    const parolaHash = await bcrypt.hash(parolaTemporara, 10);

    const { rows } = await query(
        `INSERT INTO users (nume, email, parola_hash, telefon, note, rol)
         VALUES ($1, $2, $3, $4, $5, 'client')
         RETURNING id, nume, email, telefon, note, creat_la`,
        [nume, email, parolaHash, telefon || null, note || null]
    );
    res.status(201).json(rows[0]);
});

// PUT /api/clienti/:id (admin, angajat)
const actualizeazaClient = asyncHandler(async (req, res) => {
    const { nume, telefon, note, activ } = req.body;
    const { rows } = await query(
        `UPDATE users SET
            nume = COALESCE($1, nume),
            telefon = COALESCE($2, telefon),
            note = COALESCE($3, note),
            activ = COALESCE($4, activ)
         WHERE id = $5 AND rol = 'client' RETURNING id, nume, email, telefon, note, activ`,
        [nume, telefon, note, activ, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mesaj: 'Clientul nu a fost gasit.' });
    res.json(rows[0]);
});

module.exports = { listaClienti, detaliuClient, creeazaClient, actualizeazaClient };
