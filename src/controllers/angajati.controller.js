const bcrypt = require('bcryptjs');
const { query, pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const SELECT_ANGAJAT = `
    SELECT a.id, a.specializare, a.data_angajarii, a.activ,
           u.id AS user_id, u.nume, u.email, u.telefon
    FROM angajati a
    JOIN users u ON u.id = a.user_id
`;

// GET /api/angajati?serviciu_id=X -> lista angajatilor (publica: necesara la rezervare)
// Daca se trimite serviciu_id, returneaza doar angajatii care presteaza acel serviciu.
const listaAngajati = asyncHandler(async (req, res) => {
    const doarActivi = req.query.toti !== '1';
    const conditii = [];
    const params = [];
    if (doarActivi) conditii.push('a.activ = TRUE');
    if (req.query.serviciu_id) {
        params.push(req.query.serviciu_id);
        conditii.push(
            `EXISTS (SELECT 1 FROM angajati_servicii ags WHERE ags.angajat_id = a.id AND ags.serviciu_id = $${params.length})`
        );
    }
    const where = conditii.length ? `WHERE ${conditii.join(' AND ')}` : '';
    const { rows } = await query(`${SELECT_ANGAJAT} ${where} ORDER BY u.nume`, params);
    res.json(rows);
});

// GET /api/angajati/cont-propriu (angajat) -> propria inregistrare de angajat,
// necesara in frontend ca sa stie ce angajat_id foloseste pentru celelalte apeluri
const contPropriu = asyncHandler(async (req, res) => {
    const { rows } = await query(`${SELECT_ANGAJAT} WHERE a.user_id = $1`, [req.user.id]);
    if (!rows[0]) return res.status(404).json({ mesaj: 'Nu exista o inregistrare de angajat pentru acest cont.' });
    res.json(rows[0]);
});

// GET /api/angajati/:id -> detaliu + servicii pe care le poate presta
const detaliuAngajat = asyncHandler(async (req, res) => {
    const { rows } = await query(`${SELECT_ANGAJAT} WHERE a.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ mesaj: 'Angajatul nu a fost gasit.' });

    const { rows: servicii } = await query(
        `SELECT s.* FROM servicii s
         JOIN angajati_servicii ags ON ags.serviciu_id = s.id
         WHERE ags.angajat_id = $1 AND s.activ = TRUE`,
        [req.params.id]
    );

    res.json({ ...rows[0], servicii });
});

// POST /api/angajati (admin) -> creeaza cont de user (rol=angajat) + inregistrare angajat
const creeazaAngajat = asyncHandler(async (req, res) => {
    const { nume, email, parola, telefon, specializare, data_angajarii } = req.body;
    if (!nume || !email || !parola) {
        return res.status(400).json({ mesaj: 'Nume, email si parola sunt obligatorii.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const parolaHash = await bcrypt.hash(parola, 10);

        const { rows: userRows } = await client.query(
            `INSERT INTO users (nume, email, parola_hash, telefon, rol)
             VALUES ($1, $2, $3, $4, 'angajat') RETURNING id, nume, email, telefon`,
            [nume, email, parolaHash, telefon || null]
        );
        const user = userRows[0];

        const { rows: angajatRows } = await client.query(
            `INSERT INTO angajati (user_id, specializare, data_angajarii)
             VALUES ($1, $2, $3) RETURNING id, specializare, data_angajarii, activ`,
            [user.id, specializare || null, data_angajarii || null]
        );

        await client.query('COMMIT');
        // atentie: NU face spread ...user dupa ...angajatRows[0] - user.id (users.id)
        // ar suprascrie angajatRows[0].id (angajati.id), care e cel folosit in restul API-ului
        res.status(201).json({
            ...angajatRows[0],
            user_id: user.id,
            nume: user.nume,
            email: user.email,
            telefon: user.telefon
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
});

// PUT /api/angajati/:id (admin)
const actualizeazaAngajat = asyncHandler(async (req, res) => {
    const { specializare, activ, telefon, nume } = req.body;
    const { rows } = await query(
        `UPDATE angajati SET
            specializare = COALESCE($1, specializare),
            activ = COALESCE($2, activ)
         WHERE id = $3 RETURNING *`,
        [specializare, activ, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mesaj: 'Angajatul nu a fost gasit.' });

    if (telefon !== undefined || nume !== undefined) {
        await query(
            `UPDATE users SET telefon = COALESCE($1, telefon), nume = COALESCE($2, nume)
             WHERE id = (SELECT user_id FROM angajati WHERE id = $3)`,
            [telefon, nume, req.params.id]
        );
    }
    res.json(rows[0]);
});

// DELETE /api/angajati/:id (admin) -> dezactivare (soft delete)
const stergeAngajat = asyncHandler(async (req, res) => {
    const { rows } = await query(
        'UPDATE angajati SET activ = FALSE WHERE id = $1 RETURNING id',
        [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mesaj: 'Angajatul nu a fost gasit.' });
    res.status(204).send();
});

// PUT /api/angajati/:id/servicii (admin) -> inlocuieste lista de servicii prestate
const seteazaServiciiAngajat = asyncHandler(async (req, res) => {
    const { servicii_id } = req.body; // array de id-uri
    if (!Array.isArray(servicii_id)) {
        return res.status(400).json({ mesaj: 'servicii_id trebuie sa fie un array.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM angajati_servicii WHERE angajat_id = $1', [req.params.id]);
        for (const serviciuId of servicii_id) {
            await client.query(
                'INSERT INTO angajati_servicii (angajat_id, serviciu_id) VALUES ($1, $2)',
                [req.params.id, serviciuId]
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    const { rows: servicii } = await query(
        `SELECT s.* FROM servicii s
         JOIN angajati_servicii ags ON ags.serviciu_id = s.id
         WHERE ags.angajat_id = $1`,
        [req.params.id]
    );
    res.json(servicii);
});

// GET /api/angajati/:id/program -> program saptamanal recurent
const listaProgram = asyncHandler(async (req, res) => {
    const { rows } = await query(
        'SELECT * FROM program_lucru WHERE angajat_id = $1 ORDER BY zi_saptamana',
        [req.params.id]
    );
    res.json(rows);
});

// PUT /api/angajati/:id/program (admin sau angajatul insusi) -> inlocuieste programul saptamanal
// body: [{ zi_saptamana: 1, ora_inceput: '09:00', ora_sfarsit: '17:00' }, ...]
const seteazaProgram = asyncHandler(async (req, res) => {
    const { program } = req.body;
    if (!Array.isArray(program)) {
        return res.status(400).json({ mesaj: 'program trebuie sa fie un array.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM program_lucru WHERE angajat_id = $1', [req.params.id]);
        for (const zi of program) {
            await client.query(
                `INSERT INTO program_lucru (angajat_id, zi_saptamana, ora_inceput, ora_sfarsit)
                 VALUES ($1, $2, $3, $4)`,
                [req.params.id, zi.zi_saptamana, zi.ora_inceput, zi.ora_sfarsit]
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
        'SELECT * FROM program_lucru WHERE angajat_id = $1 ORDER BY zi_saptamana',
        [req.params.id]
    );
    res.json(rows);
});

// GET /api/angajati/:id/zile-libere
const listaZileLibere = asyncHandler(async (req, res) => {
    const { rows } = await query(
        'SELECT * FROM zile_libere WHERE angajat_id = $1 AND data >= CURRENT_DATE ORDER BY data',
        [req.params.id]
    );
    res.json(rows);
});

// POST /api/angajati/:id/zile-libere (admin sau angajatul insusi)
const adaugaZiLibera = asyncHandler(async (req, res) => {
    const { data, motiv } = req.body;
    if (!data) return res.status(400).json({ mesaj: 'Data este obligatorie.' });
    const { rows } = await query(
        `INSERT INTO zile_libere (angajat_id, data, motiv) VALUES ($1, $2, $3) RETURNING *`,
        [req.params.id, data, motiv || null]
    );
    res.status(201).json(rows[0]);
});

// DELETE /api/angajati/:id/zile-libere/:ziId
const stergeZiLibera = asyncHandler(async (req, res) => {
    await query('DELETE FROM zile_libere WHERE id = $1 AND angajat_id = $2', [req.params.ziId, req.params.id]);
    res.status(204).send();
});

// GET /api/angajati/:id/disponibilitate?data=YYYY-MM-DD&serviciu_id=1
// Calculeaza sloturile orare libere pentru un angajat, intr-o zi, pentru un anumit serviciu.
const disponibilitate = asyncHandler(async (req, res) => {
    const angajatId = req.params.id;
    const { data, serviciu_id } = req.query;
    if (!data || !serviciu_id) {
        return res.status(400).json({ mesaj: 'Parametrii data si serviciu_id sunt obligatorii.' });
    }

    const { rows: servRows } = await query('SELECT durata_minute FROM servicii WHERE id = $1', [serviciu_id]);
    if (!servRows[0]) return res.status(404).json({ mesaj: 'Serviciul nu a fost gasit.' });
    const durataMinute = servRows[0].durata_minute;

    // ziua saptamanii dupa conventia PostgreSQL EXTRACT(DOW): 0=Duminica..6=Sambata
    const ziSaptamana = new Date(`${data}T00:00:00`).getDay();

    const { rows: ziLibera } = await query(
        'SELECT 1 FROM zile_libere WHERE angajat_id = $1 AND data = $2',
        [angajatId, data]
    );
    if (ziLibera[0]) return res.json([]);

    const { rows: programRows } = await query(
        'SELECT ora_inceput, ora_sfarsit FROM program_lucru WHERE angajat_id = $1 AND zi_saptamana = $2',
        [angajatId, ziSaptamana]
    );
    if (!programRows[0]) return res.json([]); // angajatul nu lucreaza in acea zi

    const { rows: ocupate } = await query(
        `SELECT inceput, sfarsit FROM programari
         WHERE angajat_id = $1 AND status <> 'anulata' AND inceput::date = $2
         ORDER BY inceput`,
        [angajatId, data]
    );

    const { ora_inceput, ora_sfarsit } = programRows[0];
    const inceputProgram = new Date(`${data}T${ora_inceput}`);
    const sfarsitProgram = new Date(`${data}T${ora_sfarsit}`);

    // Sloturi consecutive, "cap la cap", de lungimea exacta a serviciului: 09:00-10:00, 10:00-11:00 etc.
    // (nu un grid fix la 15 minute) - daca un slot candidat se suprapune cu o programare existenta,
    // sarim direct la finalul acelei programari si continuam de acolo, ca sa nu pierdem golurile reale
    // din program atunci cand alte servicii au durate diferite.
    const sloturi = [];
    let cursor = new Date(inceputProgram);

    while (cursor.getTime() + durataMinute * 60000 <= sfarsitProgram.getTime()) {
        const sfarsitSlot = new Date(cursor.getTime() + durataMinute * 60000);
        const suprapunere = ocupate.find((p) => cursor < new Date(p.sfarsit) && sfarsitSlot > new Date(p.inceput));

        if (suprapunere) {
            cursor = new Date(suprapunere.sfarsit);
        } else {
            sloturi.push({ inceput: cursor.toISOString(), sfarsit: sfarsitSlot.toISOString() });
            cursor = sfarsitSlot;
        }
    }

    res.json(sloturi);
});

module.exports = {
    listaAngajati,
    contPropriu,
    detaliuAngajat,
    creeazaAngajat,
    actualizeazaAngajat,
    stergeAngajat,
    seteazaServiciiAngajat,
    listaProgram,
    seteazaProgram,
    listaZileLibere,
    adaugaZiLibera,
    stergeZiLibera,
    disponibilitate
};
