const { query, pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/servicii -> lista publica de servicii active (folosita si la rezervare)
const listaServicii = asyncHandler(async (req, res) => {
    const includeInactive = req.query.toate === '1' && req.user && req.user.rol === 'admin';
    const { rows } = await query(
        `SELECT * FROM servicii ${includeInactive ? '' : 'WHERE activ = TRUE'} ORDER BY categorie, nume`
    );
    res.json(rows);
});

// GET /api/servicii/:id
const detaliuServiciu = asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM servicii WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ mesaj: 'Serviciul nu a fost gasit.' });
    res.json(rows[0]);
});

// POST /api/servicii (admin)
const creeazaServiciu = asyncHandler(async (req, res) => {
    const { nume, descriere, categorie, durata_minute, pret } = req.body;
    if (!nume || !durata_minute || pret === undefined) {
        return res.status(400).json({ mesaj: 'Nume, durata_minute si pret sunt obligatorii.' });
    }
    const { rows } = await query(
        `INSERT INTO servicii (nume, descriere, categorie, durata_minute, pret)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [nume, descriere || null, categorie || null, durata_minute, pret]
    );
    res.status(201).json(rows[0]);
});

// PUT /api/servicii/:id (admin)
const actualizeazaServiciu = asyncHandler(async (req, res) => {
    const { nume, descriere, categorie, durata_minute, pret, activ } = req.body;
    const { rows } = await query(
        `UPDATE servicii SET
            nume = COALESCE($1, nume),
            descriere = COALESCE($2, descriere),
            categorie = COALESCE($3, categorie),
            durata_minute = COALESCE($4, durata_minute),
            pret = COALESCE($5, pret),
            activ = COALESCE($6, activ)
         WHERE id = $7 RETURNING *`,
        [nume, descriere, categorie, durata_minute, pret, activ, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mesaj: 'Serviciul nu a fost gasit.' });
    res.json(rows[0]);
});

// DELETE /api/servicii/:id (admin) -> dezactivare (soft delete), pastram istoricul programarilor
const stergeServiciu = asyncHandler(async (req, res) => {
    const { rows } = await query(
        'UPDATE servicii SET activ = FALSE WHERE id = $1 RETURNING id',
        [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mesaj: 'Serviciul nu a fost gasit.' });
    res.status(204).send();
});

// GET /api/servicii/:id/produse -> produsele consumate de acest serviciu, cu cantitatea necesara
const listaProduseServiciu = asyncHandler(async (req, res) => {
    const { rows } = await query(
        `SELECT p.id, p.nume, p.unitate_masura, sp.cantitate_necesara
         FROM servicii_produse sp
         JOIN produse p ON p.id = sp.produs_id
         WHERE sp.serviciu_id = $1
         ORDER BY p.nume`,
        [req.params.id]
    );
    res.json(rows);
});

// PUT /api/servicii/:id/produse (admin) -> inlocuieste lista de produse consumate de serviciu
// body: { produse: [{ produs_id, cantitate_necesara }, ...] }
const seteazaProduseServiciu = asyncHandler(async (req, res) => {
    const { produse } = req.body;
    if (!Array.isArray(produse)) {
        return res.status(400).json({ mesaj: 'produse trebuie sa fie un array.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM servicii_produse WHERE serviciu_id = $1', [req.params.id]);
        for (const item of produse) {
            if (!item.cantitate_necesara || item.cantitate_necesara <= 0) continue;
            await client.query(
                'INSERT INTO servicii_produse (serviciu_id, produs_id, cantitate_necesara) VALUES ($1, $2, $3)',
                [req.params.id, item.produs_id, item.cantitate_necesara]
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    const { rows } = await query(
        `SELECT p.id, p.nume, p.unitate_masura, sp.cantitate_necesara
         FROM servicii_produse sp JOIN produse p ON p.id = sp.produs_id
         WHERE sp.serviciu_id = $1 ORDER BY p.nume`,
        [req.params.id]
    );
    res.json(rows);
});

module.exports = {
    listaServicii,
    detaliuServiciu,
    creeazaServiciu,
    actualizeazaServiciu,
    stergeServiciu,
    listaProduseServiciu,
    seteazaProduseServiciu
};
