const { query, pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/setari -> setarile salonului + programul saptamanal (public, folosit pe pagina de rezervare)
const getSetari = asyncHandler(async (req, res) => {
    const { rows: setariRows } = await query('SELECT * FROM setari_salon WHERE id = 1');
    const { rows: program } = await query('SELECT * FROM program_salon ORDER BY zi_saptamana');
    if (!setariRows[0]) return res.status(404).json({ mesaj: 'Setarile salonului nu au fost gasite.' });
    res.json({ ...setariRows[0], program });
});

// PUT /api/setari (admin) -> actualizeaza datele de contact/locatie
const actualizeazaSetari = asyncHandler(async (req, res) => {
    const { nume, descriere, adresa, oras, telefon, email } = req.body;
    const { rows } = await query(
        `UPDATE setari_salon SET
            nume = COALESCE($1, nume),
            descriere = COALESCE($2, descriere),
            adresa = COALESCE($3, adresa),
            oras = COALESCE($4, oras),
            telefon = COALESCE($5, telefon),
            email = COALESCE($6, email),
            actualizat_la = now()
         WHERE id = 1 RETURNING *`,
        [nume, descriere, adresa, oras, telefon, email]
    );
    res.json(rows[0]);
});

// PUT /api/setari/program (admin) -> inlocuieste programul de functionare (7 zile, cu flag inchis)
// body: { program: [{ zi_saptamana, inchis, ora_inceput, ora_sfarsit }, ...] }
const actualizeazaProgramSalon = asyncHandler(async (req, res) => {
    const { program } = req.body;
    if (!Array.isArray(program) || program.length !== 7) {
        return res.status(400).json({ mesaj: 'program trebuie sa contina exact 7 zile.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const zi of program) {
            await client.query(
                `UPDATE program_salon SET inchis = $1, ora_inceput = $2, ora_sfarsit = $3
                 WHERE zi_saptamana = $4`,
                [zi.inchis, zi.inchis ? null : zi.ora_inceput, zi.inchis ? null : zi.ora_sfarsit, zi.zi_saptamana]
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    const { rows } = await query('SELECT * FROM program_salon ORDER BY zi_saptamana');
    res.json(rows);
});

module.exports = { getSetari, actualizeazaSetari, actualizeazaProgramSalon };
