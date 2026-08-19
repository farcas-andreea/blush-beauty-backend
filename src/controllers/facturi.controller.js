const { query, pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { scrieFacturaPdf } = require('../utils/facturaPdf');

const TVA_PROCENT = 0.19;

const SELECT_FACTURA = `
    SELECT f.*, u.nume AS client_nume, u.email AS client_email
    FROM facturi f
    JOIN users u ON u.id = f.client_id
`;

// GET /api/facturi -> lista (admin), filtrabila dupa client/status
const listaFacturi = asyncHandler(async (req, res) => {
    const conditii = [];
    const params = [];
    if (req.query.client_id) {
        params.push(req.query.client_id);
        conditii.push(`f.client_id = $${params.length}`);
    }
    if (req.query.status) {
        params.push(req.query.status);
        conditii.push(`f.status = $${params.length}`);
    }
    const where = conditii.length ? `WHERE ${conditii.join(' AND ')}` : '';
    const { rows } = await query(`${SELECT_FACTURA} ${where} ORDER BY f.data_emiterii DESC`, params);
    res.json(rows);
});

// GET /api/facturi/:id -> detaliu + linii
const detaliuFactura = asyncHandler(async (req, res) => {
    const { rows } = await query(`${SELECT_FACTURA} WHERE f.id = $1`, [req.params.id]);
    const factura = rows[0];
    if (!factura) return res.status(404).json({ mesaj: 'Factura nu a fost gasita.' });

    if (req.user.rol === 'client' && factura.client_id !== req.user.id) {
        return res.status(403).json({ mesaj: 'Nu ai acces la aceasta factura.' });
    }

    const { rows: linii } = await query('SELECT * FROM factura_linii WHERE factura_id = $1 ORDER BY id', [
        req.params.id
    ]);
    res.json({ ...factura, linii });
});

// GET /api/facturi/:id/pdf -> descarca factura ca document PDF
const descarcaFacturaPdf = asyncHandler(async (req, res) => {
    const { rows } = await query(`${SELECT_FACTURA} WHERE f.id = $1`, [req.params.id]);
    const factura = rows[0];
    if (!factura) return res.status(404).json({ mesaj: 'Factura nu a fost gasita.' });

    if (req.user.rol === 'client' && factura.client_id !== req.user.id) {
        return res.status(403).json({ mesaj: 'Nu ai acces la aceasta factura.' });
    }

    const { rows: linii } = await query('SELECT * FROM factura_linii WHERE factura_id = $1 ORDER BY id', [
        req.params.id
    ]);
    const { rows: setariRows } = await query('SELECT * FROM setari_salon WHERE id = 1');

    scrieFacturaPdf(res, factura, linii, setariRows[0]);
});

// GET /api/facturi/proprii -> facturile clientului autentificat
const facturileMele = asyncHandler(async (req, res) => {
    const { rows } = await query(`${SELECT_FACTURA} WHERE f.client_id = $1 ORDER BY f.data_emiterii DESC`, [
        req.user.id
    ]);
    res.json(rows);
});

// POST /api/facturi (admin, angajat) -> emite factura pentru o programare,
// optional cu produse suplimentare vandute (ex: cosmetice folosite/cumparate la sedinta)
// body: { programare_id, metoda_plata, produse: [{ produs_id, cantitate }] }
const creeazaFactura = asyncHandler(async (req, res) => {
    const { programare_id, metoda_plata, produse } = req.body;
    if (!programare_id) return res.status(400).json({ mesaj: 'programare_id este obligatoriu.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: progRows } = await client.query(
            `SELECT p.id, p.client_id, p.pret_final, s.nume AS serviciu_nume, s.id AS serviciu_id
             FROM programari p JOIN servicii s ON s.id = p.serviciu_id
             WHERE p.id = $1`,
            [programare_id]
        );
        const programare = progRows[0];
        if (!programare) {
            await client.query('ROLLBACK');
            return res.status(404).json({ mesaj: 'Programarea nu a fost gasita.' });
        }

        const { rows: existenta } = await client.query('SELECT id FROM facturi WHERE programare_id = $1', [
            programare_id
        ]);
        if (existenta[0]) {
            await client.query('ROLLBACK');
            return res.status(409).json({ mesaj: 'Exista deja o factura pentru aceasta programare.' });
        }

        const linii = [
            {
                tip: 'serviciu',
                referinta_id: programare.serviciu_id,
                descriere: programare.serviciu_nume,
                cantitate: 1,
                pret_unitar: Number(programare.pret_final)
            }
        ];

        // adaugare produse vandute pe aceeasi factura + scadere din stoc
        for (const item of produse || []) {
            const { rows: produsRows } = await client.query('SELECT * FROM produse WHERE id = $1 FOR UPDATE', [
                item.produs_id
            ]);
            const produs = produsRows[0];
            if (!produs) {
                await client.query('ROLLBACK');
                return res.status(404).json({ mesaj: `Produsul ${item.produs_id} nu a fost gasit.` });
            }
            const cantitate = Number(item.cantitate) || 1;
            if (Number(produs.cantitate_stoc) < cantitate) {
                await client.query('ROLLBACK');
                return res.status(400).json({ mesaj: `Stoc insuficient pentru produsul "${produs.nume}".` });
            }

            await client.query('UPDATE produse SET cantitate_stoc = cantitate_stoc - $1 WHERE id = $2', [
                cantitate,
                produs.id
            ]);
            await client.query(
                `INSERT INTO miscari_stoc (produs_id, tip, cantitate, motiv, programare_id, utilizator_id)
                 VALUES ($1, 'iesire', $2, 'vanzare pe factura', $3, $4)`,
                [produs.id, cantitate, programare_id, req.user.id]
            );

            linii.push({
                tip: 'produs',
                referinta_id: produs.id,
                descriere: produs.nume,
                cantitate,
                pret_unitar: Number(produs.pret_vanzare) || 0
            });
        }

        const subtotal = linii.reduce((suma, l) => suma + l.cantitate * l.pret_unitar, 0);
        const tva = Math.round(subtotal * TVA_PROCENT * 100) / 100;
        const total = Math.round((subtotal + tva) * 100) / 100;

        // id-ul si numarul facturii provin din acelasi nextval, ca sa fie mereu in sincron
        const { rows: seqRows } = await client.query("SELECT nextval('facturi_id_seq') AS id");
        const facturaId = seqRows[0].id;
        const numarFactura = `F-${new Date().getFullYear()}-${String(facturaId).padStart(6, '0')}`;

        await client.query(
            `INSERT INTO facturi (id, numar_factura, client_id, programare_id, subtotal, tva, total, metoda_plata, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'emisa')`,
            [facturaId, numarFactura, programare.client_id, programare_id, subtotal, tva, total, metoda_plata || null]
        );

        for (const linie of linii) {
            await client.query(
                `INSERT INTO factura_linii (factura_id, tip, referinta_id, descriere, cantitate, pret_unitar, total_linie)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [facturaId, linie.tip, linie.referinta_id, linie.descriere, linie.cantitate, linie.pret_unitar, linie.cantitate * linie.pret_unitar]
            );
        }

        await client.query('COMMIT');

        const { rows: rezultat } = await query(`${SELECT_FACTURA} WHERE f.id = $1`, [facturaId]);
        const { rows: liniiFinale } = await query('SELECT * FROM factura_linii WHERE factura_id = $1', [facturaId]);
        res.status(201).json({ ...rezultat[0], linii: liniiFinale });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
});

// PUT /api/facturi/:id/status (admin, angajat) -> marcheaza plata
const actualizeazaStatusFactura = asyncHandler(async (req, res) => {
    const { status, metoda_plata } = req.body;
    const statusuriValide = ['emisa', 'platita', 'anulata'];
    if (!statusuriValide.includes(status)) {
        return res.status(400).json({ mesaj: `Status invalid. Valori acceptate: ${statusuriValide.join(', ')}` });
    }

    const dataPlatii = status === 'platita' ? new Date() : null;
    const { rows } = await query(
        `UPDATE facturi SET status = $1, metoda_plata = COALESCE($2, metoda_plata), data_platii = COALESCE($3, data_platii)
         WHERE id = $4 RETURNING *`,
        [status, metoda_plata, dataPlatii, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mesaj: 'Factura nu a fost gasita.' });
    res.json(rows[0]);
});

module.exports = {
    listaFacturi,
    detaliuFactura,
    descarcaFacturaPdf,
    facturileMele,
    creeazaFactura,
    actualizeazaStatusFactura
};
