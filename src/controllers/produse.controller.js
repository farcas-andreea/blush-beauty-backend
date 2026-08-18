const { query, pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/produse
const listaProduse = asyncHandler(async (req, res) => {
    const doarActive = req.query.toate !== '1';
    const { rows } = await query(
        `SELECT *, (cantitate_stoc <= prag_alerta) AS stoc_scazut
         FROM produse ${doarActive ? 'WHERE activ = TRUE' : ''} ORDER BY nume`
    );
    res.json(rows);
});

// GET /api/produse/stoc-scazut -> produsele care au atins pragul de alerta
const listaStocScazut = asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM v_stoc_scazut ORDER BY nume');
    res.json(rows);
});

// GET /api/produse/:id
const detaliuProdus = asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM produse WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ mesaj: 'Produsul nu a fost gasit.' });
    res.json(rows[0]);
});

// POST /api/produse (admin)
const creeazaProdus = asyncHandler(async (req, res) => {
    const { nume, descriere, cantitate_stoc, unitate_masura, prag_alerta, pret_achizitie, pret_vanzare, furnizor } =
        req.body;
    if (!nume) return res.status(400).json({ mesaj: 'Numele produsului este obligatoriu.' });

    const { rows } = await query(
        `INSERT INTO produse (nume, descriere, cantitate_stoc, unitate_masura, prag_alerta, pret_achizitie, pret_vanzare, furnizor)
         VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 'buc'), COALESCE($5, 0), $6, $7, $8) RETURNING *`,
        [nume, descriere || null, cantitate_stoc, unitate_masura, prag_alerta, pret_achizitie, pret_vanzare, furnizor]
    );
    res.status(201).json(rows[0]);
});

// PUT /api/produse/:id (admin)
const actualizeazaProdus = asyncHandler(async (req, res) => {
    const { nume, descriere, unitate_masura, prag_alerta, pret_achizitie, pret_vanzare, furnizor, activ } = req.body;
    const { rows } = await query(
        `UPDATE produse SET
            nume = COALESCE($1, nume),
            descriere = COALESCE($2, descriere),
            unitate_masura = COALESCE($3, unitate_masura),
            prag_alerta = COALESCE($4, prag_alerta),
            pret_achizitie = COALESCE($5, pret_achizitie),
            pret_vanzare = COALESCE($6, pret_vanzare),
            furnizor = COALESCE($7, furnizor),
            activ = COALESCE($8, activ)
         WHERE id = $9 RETURNING *`,
        [nume, descriere, unitate_masura, prag_alerta, pret_achizitie, pret_vanzare, furnizor, activ, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mesaj: 'Produsul nu a fost gasit.' });
    res.json(rows[0]);
});

// DELETE /api/produse/:id (admin) -> dezactivare
const stergeProdus = asyncHandler(async (req, res) => {
    const { rows } = await query('UPDATE produse SET activ = FALSE WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ mesaj: 'Produsul nu a fost gasit.' });
    res.status(204).send();
});

// POST /api/produse/:id/miscari -> inregistreaza intrare/iesire de stoc si actualizeaza cantitatea curenta
const adaugaMiscareStoc = asyncHandler(async (req, res) => {
    const { tip, cantitate, motiv, programare_id } = req.body;
    if (!['intrare', 'iesire'].includes(tip) || !cantitate || cantitate <= 0) {
        return res.status(400).json({ mesaj: "tip ('intrare'/'iesire') si cantitate (> 0) sunt obligatorii." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: produsRows } = await client.query('SELECT cantitate_stoc FROM produse WHERE id = $1 FOR UPDATE', [
            req.params.id
        ]);
        if (!produsRows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ mesaj: 'Produsul nu a fost gasit.' });
        }

        const stocNou =
            tip === 'intrare'
                ? Number(produsRows[0].cantitate_stoc) + Number(cantitate)
                : Number(produsRows[0].cantitate_stoc) - Number(cantitate);

        if (stocNou < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ mesaj: 'Stocul nu poate deveni negativ.' });
        }

        await client.query('UPDATE produse SET cantitate_stoc = $1 WHERE id = $2', [stocNou, req.params.id]);

        const { rows: miscare } = await client.query(
            `INSERT INTO miscari_stoc (produs_id, tip, cantitate, motiv, programare_id, utilizator_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [req.params.id, tip, cantitate, motiv || null, programare_id || null, req.user.id]
        );

        await client.query('COMMIT');
        res.status(201).json({ ...miscare[0], cantitate_stoc_curenta: stocNou });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
});

// GET /api/produse/:id/miscari -> istoricul miscarilor de stoc pentru un produs
const listaMiscariStoc = asyncHandler(async (req, res) => {
    const { rows } = await query(
        `SELECT m.*, u.nume AS utilizator_nume
         FROM miscari_stoc m
         LEFT JOIN users u ON u.id = m.utilizator_id
         WHERE m.produs_id = $1 ORDER BY m.creat_la DESC`,
        [req.params.id]
    );
    res.json(rows);
});

module.exports = {
    listaProduse,
    listaStocScazut,
    detaliuProdus,
    creeazaProdus,
    actualizeazaProdus,
    stergeProdus,
    adaugaMiscareStoc,
    listaMiscariStoc
};
