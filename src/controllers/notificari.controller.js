const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { trimiteEmailProgramare } = require('../utils/email');

const SELECT_PROGRAMARE = `
    SELECT p.id, p.inceput, p.sfarsit, p.status,
           c.nume AS client_nume, c.email AS client_email,
           ua.nume AS angajat_nume,
           s.nume AS serviciu_nume
    FROM programari p
    JOIN users c ON c.id = p.client_id
    JOIN angajati a ON a.id = p.angajat_id
    JOIN users ua ON ua.id = a.user_id
    JOIN servicii s ON s.id = p.serviciu_id
`;

// Trimite remindere pentru toate programarile din ziua urmatoare care nu au primit deja unul.
// Poate fi apelata manual (din panoul de admin) sau automat, o data pe zi, dintr-un job cron.
async function trimiteRemindereZiUrmatoare() {
    const { rows: programari } = await query(
        `${SELECT_PROGRAMARE}
         WHERE p.status IN ('in_asteptare', 'confirmata')
           AND p.inceput::date = (CURRENT_DATE + INTERVAL '1 day')::date
           AND NOT EXISTS (
               SELECT 1 FROM notificari n
               WHERE n.programare_id = p.id AND n.tip = 'reminder' AND n.status = 'trimisa'
           )`
    );

    const rezultate = [];
    for (const programare of programari) {
        const rezultat = await trimiteEmailProgramare('reminder', programare);
        rezultate.push({ programare_id: programare.id, ...rezultat });
    }
    return rezultate;
}

// POST /api/notificari/trimite-remindere (admin) -> declansare manuala, utila pentru testare/demo
const trimiteRemindere = asyncHandler(async (req, res) => {
    const rezultate = await trimiteRemindereZiUrmatoare();
    res.json({ trimise: rezultate.length, detalii: rezultate });
});

module.exports = { trimiteRemindere, trimiteRemindereZiUrmatoare };
