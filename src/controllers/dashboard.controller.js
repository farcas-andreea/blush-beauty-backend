const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/dashboard/statistici?de_la=YYYY-MM-DD&pana_la=YYYY-MM-DD (admin)
// Agrega datele necesare pentru dashboard-ul de administrare.
const statistici = asyncHandler(async (req, res) => {
    const deLa = req.query.de_la || '1900-01-01';
    const panaLa = req.query.pana_la || '2999-12-31';

    const [venituri, programariPeStatus, topServicii, venituriPeZi, ocupareAngajati, stocScazut] = await Promise.all([
        query(
            `SELECT COALESCE(SUM(total), 0) AS total
             FROM facturi WHERE status = 'platita' AND data_platii::date BETWEEN $1 AND $2`,
            [deLa, panaLa]
        ),
        query(
            `SELECT status, COUNT(*)::int AS numar
             FROM programari WHERE inceput::date BETWEEN $1 AND $2
             GROUP BY status`,
            [deLa, panaLa]
        ),
        query(
            `SELECT s.id, s.nume, COUNT(p.id)::int AS numar_programari,
                    COALESCE(SUM(p.pret_final) FILTER (WHERE p.status = 'finalizata'), 0) AS venit_generat
             FROM servicii s
             LEFT JOIN programari p ON p.serviciu_id = s.id AND p.inceput::date BETWEEN $1 AND $2
             GROUP BY s.id, s.nume
             ORDER BY numar_programari DESC
             LIMIT 5`,
            [deLa, panaLa]
        ),
        query(
            `SELECT data_platii::date AS data, COALESCE(SUM(total), 0) AS total
             FROM facturi WHERE status = 'platita' AND data_platii::date BETWEEN $1 AND $2
             GROUP BY data_platii::date
             ORDER BY data`,
            [deLa, panaLa]
        ),
        query(
            `SELECT ua.nume AS angajat_nume, COUNT(p.id)::int AS numar_programari
             FROM angajati a
             JOIN users ua ON ua.id = a.user_id
             LEFT JOIN programari p ON p.angajat_id = a.id AND p.status = 'finalizata' AND p.inceput::date BETWEEN $1 AND $2
             GROUP BY ua.nume
             ORDER BY numar_programari DESC`,
            [deLa, panaLa]
        ),
        query('SELECT COUNT(*)::int AS numar FROM v_stoc_scazut')
    ]);

    res.json({
        venituri_totale: Number(venituri.rows[0].total),
        programari_pe_status: programariPeStatus.rows,
        top_servicii: topServicii.rows,
        venituri_pe_zi: venituriPeZi.rows,
        ocupare_angajati: ocupareAngajati.rows,
        produse_stoc_scazut: stocScazut.rows[0].numar
    });
});

module.exports = { statistici };
