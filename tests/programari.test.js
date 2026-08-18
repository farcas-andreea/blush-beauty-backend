const { app, request, autentificaAdmin, idUnic } = require('./helpers');
const { pool } = require('../src/config/db');

// Toate zilele saptamanii, program larg, ca testul sa functioneze indiferent de ziua reala in care ruleaza.
const PROGRAM_COMPLET = [0, 1, 2, 3, 4, 5, 6].map((zi) => ({ zi_saptamana: zi, ora_inceput: '08:00', ora_sfarsit: '20:00' }));

function pesteZile(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

describe('Programari - suprapuneri si disponibilitate', () => {
    let tokenAdmin;
    let tokenClient;
    let angajatId;
    let angajatUserId;
    let serviciuId;
    let clientUserId;
    const programariCreate = [];
    const dataTest = pesteZile(20); // suficient de departe sa nu se ciocneasca cu date reale existente

    beforeAll(async () => {
        tokenAdmin = await autentificaAdmin();

        const servRes = await request(app)
            .post('/api/servicii')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nume: `Serviciu Test ${idUnic()}`, durata_minute: 60, pret: 100 });
        serviciuId = servRes.body.id;

        const angajatRes = await request(app)
            .post('/api/angajati')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nume: 'Angajat Test', email: `angajat.test.${idUnic()}@exemplu.ro`, parola: 'Parola123!' });
        angajatId = angajatRes.body.id;
        angajatUserId = angajatRes.body.user_id;

        await request(app)
            .put(`/api/angajati/${angajatId}/servicii`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ servicii_id: [serviciuId] });

        await request(app)
            .put(`/api/angajati/${angajatId}/program`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ program: PROGRAM_COMPLET });

        const clientEmail = `client.test.${idUnic()}@exemplu.ro`;
        const clientRes = await request(app)
            .post('/api/auth/inregistrare')
            .send({ nume: 'Client Test Programari', email: clientEmail, parola: 'Parola123!' });
        tokenClient = clientRes.body.token;
        clientUserId = clientRes.body.user.id;
    });

    afterAll(async () => {
        if (programariCreate.length) {
            await pool.query('DELETE FROM programari WHERE id = ANY($1::bigint[])', [programariCreate]);
        }
        if (angajatUserId) await pool.query('DELETE FROM users WHERE id = $1', [angajatUserId]);
        if (serviciuId) await pool.query('DELETE FROM servicii WHERE id = $1', [serviciuId]);
        if (clientUserId) await pool.query('DELETE FROM users WHERE id = $1', [clientUserId]);
        await pool.end();
    });

    test('disponibilitatea ofera sloturi cap-la-cap, de lungimea exacta a serviciului', async () => {
        const res = await request(app)
            .get(`/api/angajati/${angajatId}/disponibilitate`)
            .query({ data: dataTest, serviciu_id: serviciuId })
            .set('Authorization', `Bearer ${tokenAdmin}`);

        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);

        const primul = res.body[0];
        const durataMs = new Date(primul.sfarsit) - new Date(primul.inceput);
        expect(durataMs).toBe(60 * 60000); // 60 minute, cat dureaza serviciul de test
    });

    test('o programare noua este creata cu succes pe un slot liber', async () => {
        const sloturi = await request(app)
            .get(`/api/angajati/${angajatId}/disponibilitate`)
            .query({ data: dataTest, serviciu_id: serviciuId })
            .set('Authorization', `Bearer ${tokenAdmin}`);
        const slot = sloturi.body[0];

        const res = await request(app)
            .post('/api/programari')
            .set('Authorization', `Bearer ${tokenClient}`)
            .send({ angajat_id: angajatId, serviciu_id: serviciuId, inceput: slot.inceput });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('in_asteptare');
        programariCreate.push(res.body.id);
    });

    test('o a doua programare pe acelasi interval, pentru acelasi angajat, este respinsa (409)', async () => {
        // primul slot a fost deja ocupat la testul anterior -> il preluam direct din baza de date
        // ca sa verificam ca serverul respinge o suprapunere exacta (constrangerea EXCLUDE din Postgres)
        const primaProgramare = await pool.query('SELECT inceput FROM programari WHERE id = $1', [programariCreate[0]]);
        const inceputBlocat = primaProgramare.rows[0].inceput.toISOString();

        const res = await request(app)
            .post('/api/programari')
            .set('Authorization', `Bearer ${tokenClient}`)
            .send({ angajat_id: angajatId, serviciu_id: serviciuId, inceput: inceputBlocat });

        expect(res.status).toBe(409);
    });

    test('sloturile disponibile nu mai includ ora deja rezervata', async () => {
        const primaProgramare = await pool.query('SELECT inceput FROM programari WHERE id = $1', [programariCreate[0]]);
        const inceputOcupat = primaProgramare.rows[0].inceput.toISOString();

        const res = await request(app)
            .get(`/api/angajati/${angajatId}/disponibilitate`)
            .query({ data: dataTest, serviciu_id: serviciuId })
            .set('Authorization', `Bearer ${tokenAdmin}`);

        const gasit = res.body.find((s) => s.inceput === inceputOcupat);
        expect(gasit).toBeUndefined();
    });

    test('dupa anularea programarii, ora redevine disponibila', async () => {
        const anulare = await request(app)
            .put(`/api/programari/${programariCreate[0]}/status`)
            .set('Authorization', `Bearer ${tokenClient}`)
            .send({ status: 'anulata' });
        expect(anulare.status).toBe(200);
        expect(anulare.body.status).toBe('anulata');

        const primaProgramare = await pool.query('SELECT inceput FROM programari WHERE id = $1', [programariCreate[0]]);
        const inceputEliberat = primaProgramare.rows[0].inceput.toISOString();

        const res = await request(app)
            .get(`/api/angajati/${angajatId}/disponibilitate`)
            .query({ data: dataTest, serviciu_id: serviciuId })
            .set('Authorization', `Bearer ${tokenAdmin}`);

        const gasit = res.body.find((s) => s.inceput === inceputEliberat);
        expect(gasit).toBeDefined();
    });
});
