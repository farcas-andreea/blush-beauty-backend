const { query, pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { trimiteEmailProgramare } = require('../utils/email');

const SELECT_PROGRAMARE = `
    SELECT p.id, p.inceput, p.sfarsit, p.status, p.pret_final, p.note, p.creat_la,
           c.id AS client_id, c.nume AS client_nume, c.telefon AS client_telefon, c.email AS client_email,
           a.id AS angajat_id, ua.nume AS angajat_nume,
           s.id AS serviciu_id, s.nume AS serviciu_nume, s.durata_minute
    FROM programari p
    JOIN users c ON c.id = p.client_id
    JOIN angajati a ON a.id = p.angajat_id
    JOIN users ua ON ua.id = a.user_id
    JOIN servicii s ON s.id = p.serviciu_id
`;

// GET /api/programari -> lista filtrata dupa rol (client vede doar ale sale,
// angajat vede doar ale sale, admin vede tot si poate filtra)
const listaProgramari = asyncHandler(async (req, res) => {
    const conditii = [];
    const params = [];

    if (req.user.rol === 'client') {
        params.push(req.user.id);
        conditii.push(`p.client_id = $${params.length}`);
    } else if (req.user.rol === 'angajat') {
        params.push(req.user.id);
        conditii.push(`ua.id = $${params.length}`);
    }
    // adminul poate filtra explicit dupa angajat/client
    if (req.user.rol === 'admin' && req.query.angajat_id) {
        params.push(req.query.angajat_id);
        conditii.push(`a.id = $${params.length}`);
    }
    if (req.user.rol === 'admin' && req.query.client_id) {
        params.push(req.query.client_id);
        conditii.push(`c.id = $${params.length}`);
    }
    if (req.query.data) {
        params.push(req.query.data);
        conditii.push(`p.inceput::date = $${params.length}`);
    }
    if (req.query.status) {
        params.push(req.query.status);
        conditii.push(`p.status = $${params.length}`);
    }

    const where = conditii.length ? `WHERE ${conditii.join(' AND ')}` : '';
    const { rows } = await query(`${SELECT_PROGRAMARE} ${where} ORDER BY p.inceput DESC`, params);
    res.json(rows);
});

// GET /api/programari/:id
const detaliuProgramare = asyncHandler(async (req, res) => {
    const { rows } = await query(`${SELECT_PROGRAMARE} WHERE p.id = $1`, [req.params.id]);
    const programare = rows[0];
    if (!programare) return res.status(404).json({ mesaj: 'Programarea nu a fost gasita.' });

    const poateVedea =
        req.user.rol === 'admin' ||
        (req.user.rol === 'client' && programare.client_id === req.user.id) ||
        (req.user.rol === 'angajat' && programare.angajat_nume && (await esteAngajatulCurent(req, programare)));

    if (!poateVedea) return res.status(403).json({ mesaj: 'Nu ai acces la aceasta programare.' });
    res.json(programare);
});

async function esteAngajatulCurent(req, programare) {
    const { rows } = await query('SELECT 1 FROM angajati WHERE id = $1 AND user_id = $2', [
        programare.angajat_id,
        req.user.id
    ]);
    return !!rows[0];
}

// POST /api/programari -> creeaza o rezervare
// - clientul rezerva pentru el insusi
// - adminul poate crea in numele oricarui client (ex: programare telefonica), trimitand client_id
const creeazaProgramare = asyncHandler(async (req, res) => {
    const { angajat_id, serviciu_id, inceput, note } = req.body;
    let clientId = req.user.id;
    if (req.user.rol === 'admin' && req.body.client_id) {
        clientId = req.body.client_id;
    }

    if (!angajat_id || !serviciu_id || !inceput) {
        return res.status(400).json({ mesaj: 'angajat_id, serviciu_id si inceput sunt obligatorii.' });
    }

    // angajatul trebuie sa poata presta acel serviciu
    const { rows: relatie } = await query(
        'SELECT 1 FROM angajati_servicii WHERE angajat_id = $1 AND serviciu_id = $2',
        [angajat_id, serviciu_id]
    );
    if (!relatie[0]) {
        return res.status(400).json({ mesaj: 'Angajatul selectat nu presteaza acest serviciu.' });
    }

    const { rows: servRows } = await query('SELECT durata_minute, pret FROM servicii WHERE id = $1 AND activ = TRUE', [
        serviciu_id
    ]);
    if (!servRows[0]) return res.status(404).json({ mesaj: 'Serviciul nu a fost gasit.' });

    const dataInceput = new Date(inceput);
    const dataSfarsit = new Date(dataInceput.getTime() + servRows[0].durata_minute * 60000);

    // constrangerea EXCLUDE din baza de date arunca eroare (23P01) daca se suprapune
    // cu o alta programare a aceluiasi angajat -> tratata central in errorHandler
    const { rows } = await query(
        `INSERT INTO programari (client_id, angajat_id, serviciu_id, inceput, sfarsit, pret_final, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [clientId, angajat_id, serviciu_id, dataInceput, dataSfarsit, servRows[0].pret, note || null]
    );

    const { rows: rezultat } = await query(`${SELECT_PROGRAMARE} WHERE p.id = $1`, [rows[0].id]);
    res.status(201).json(rezultat[0]);

    // trimitem emailul de confirmare dupa ce am raspuns clientului -> nu-l facem sa astepte
    // trimiterea; erorile de email sunt prinse si logate intern, nu ajung sa strice cererea
    trimiteEmailProgramare('confirmare', rezultat[0]).catch(() => {});
});

// PUT /api/programari/:id/status -> confirmare / finalizare / anulare
const actualizeazaStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const statusuriValide = ['in_asteptare', 'confirmata', 'finalizata', 'anulata'];
    if (!statusuriValide.includes(status)) {
        return res.status(400).json({ mesaj: `Status invalid. Valori acceptate: ${statusuriValide.join(', ')}` });
    }

    const { rows } = await query(`${SELECT_PROGRAMARE} WHERE p.id = $1`, [req.params.id]);
    const programare = rows[0];
    if (!programare) return res.status(404).json({ mesaj: 'Programarea nu a fost gasita.' });

    const esteClientulPropriu = req.user.rol === 'client' && programare.client_id === req.user.id;
    const esteAngajat = req.user.rol === 'angajat' && (await esteAngajatulCurent(req, programare));
    const esteAdmin = req.user.rol === 'admin';

    if (!esteAdmin && !esteAngajat && !(esteClientulPropriu && status === 'anulata')) {
        return res.status(403).json({ mesaj: 'Nu ai permisiunea sa faci aceasta modificare.' });
    }

    const devineFinalizata = status === 'finalizata' && programare.status !== 'finalizata';

    const client = await pool.connect();
    let actualizat;
    try {
        await client.query('BEGIN');

        const { rows: rezultatUpdate } = await client.query(
            'UPDATE programari SET status = $1 WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );
        actualizat = rezultatUpdate[0];

        // La prima finalizare, scade automat din stoc produsele asociate serviciului
        // (ex: vopsit -> scade automat vopseaua si oxidantul folosite).
        if (devineFinalizata) {
            const { rows: consumuri } = await client.query(
                'SELECT produs_id, cantitate_necesara FROM servicii_produse WHERE serviciu_id = $1',
                [programare.serviciu_id]
            );
            for (const consum of consumuri) {
                const { rows: produsRows } = await client.query('SELECT cantitate_stoc FROM produse WHERE id = $1 FOR UPDATE', [
                    consum.produs_id
                ]);
                if (!produsRows[0]) continue;

                // nu lasam stocul sa scada sub 0 - daca nu mai e destul, scadem doar cat exista
                const cantitateReala = Math.min(Number(consum.cantitate_necesara), Number(produsRows[0].cantitate_stoc));
                if (cantitateReala <= 0) continue;

                await client.query('UPDATE produse SET cantitate_stoc = cantitate_stoc - $1 WHERE id = $2', [
                    cantitateReala,
                    consum.produs_id
                ]);
                await client.query(
                    `INSERT INTO miscari_stoc (produs_id, tip, cantitate, motiv, programare_id, utilizator_id)
                     VALUES ($1, 'iesire', $2, 'Consum automat la finalizarea programarii', $3, $4)`,
                    [consum.produs_id, cantitateReala, req.params.id, req.user.id]
                );
            }

            // Emite automat o factura (status "emisa", neplatita inca) pentru serviciul prestat,
            // ca sa nu mai fie nevoie de un pas manual separat. Se poate marca "platita" din Facturi.
            const { rows: facturaExistenta } = await client.query('SELECT id FROM facturi WHERE programare_id = $1', [
                req.params.id
            ]);
            if (!facturaExistenta[0]) {
                const subtotal = Number(programare.pret_final);
                const tva = Math.round(subtotal * 0.19 * 100) / 100;
                const total = Math.round((subtotal + tva) * 100) / 100;

                const { rows: seqRows } = await client.query("SELECT nextval('facturi_id_seq') AS id");
                const facturaId = seqRows[0].id;
                const numarFactura = `F-${new Date().getFullYear()}-${String(facturaId).padStart(6, '0')}`;

                await client.query(
                    `INSERT INTO facturi (id, numar_factura, client_id, programare_id, subtotal, tva, total, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, 'emisa')`,
                    [facturaId, numarFactura, programare.client_id, req.params.id, subtotal, tva, total]
                );
                await client.query(
                    `INSERT INTO factura_linii (factura_id, tip, referinta_id, descriere, cantitate, pret_unitar, total_linie)
                     VALUES ($1, 'serviciu', $2, $3, 1, $4, $4)`,
                    [facturaId, programare.serviciu_id, programare.serviciu_nume, subtotal]
                );
            }
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    res.json(actualizat);

    if (status === 'anulata') {
        trimiteEmailProgramare('anulare', programare).catch(() => {});
    }
});

module.exports = {
    listaProgramari,
    detaliuProgramare,
    creeazaProgramare,
    actualizeazaStatus
};
