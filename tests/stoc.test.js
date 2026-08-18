const { app, request, autentificaAdmin, idUnic } = require('./helpers');
const { pool } = require('../src/config/db');

const PROGRAM_COMPLET = [0, 1, 2, 3, 4, 5, 6].map((zi) => ({ zi_saptamana: zi, ora_inceput: '08:00', ora_sfarsit: '20:00' }));

function pesteZile(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

describe('Consum automat de stoc la finalizarea unei programari', () => {
    let tokenAdmin;
    let angajatId;
    let angajatUserId;
    let serviciuId;
    let produsId;
    let clientUserId;
    const programariCreate = [];
    const dataTest = pesteZile(21);

    beforeAll(async () => {
        tokenAdmin = await autentificaAdmin();

        const servRes = await request(app)
            .post('/api/servicii')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nume: `Serviciu Stoc Test ${idUnic()}`, durata_minute: 30, pret: 50 });
        serviciuId = servRes.body.id;

        const produsRes = await request(app)
            .post('/api/produse')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nume: `Produs Test ${idUnic()}`, cantitate_stoc: 10, unitate_masura: 'ml' });
        produsId = produsRes.body.id;

        // serviciul consuma 4 unitati din produs la fiecare prestare
        await request(app)
            .put(`/api/servicii/${serviciuId}/produse`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ produse: [{ produs_id: produsId, cantitate_necesara: 4 }] });

        const angajatRes = await request(app)
            .post('/api/angajati')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ nume: 'Angajat Stoc Test', email: `angajat.stoc.${idUnic()}@exemplu.ro`, parola: 'Parola123!' });
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

        const clientRes = await request(app)
            .post('/api/auth/inregistrare')
            .send({ nume: 'Client Stoc Test', email: `client.stoc.${idUnic()}@exemplu.ro`, parola: 'Parola123!' });
        clientUserId = clientRes.body.user.id;
    });

    afterAll(async () => {
        if (programariCreate.length) {
            await pool.query('DELETE FROM notificari WHERE programare_id = ANY($1::bigint[])', [programariCreate]);
            await pool.query('DELETE FROM facturi WHERE programare_id = ANY($1::bigint[])', [programariCreate]);
            await pool.query('DELETE FROM miscari_stoc WHERE programare_id = ANY($1::bigint[])', [programariCreate]);
            await pool.query('DELETE FROM programari WHERE id = ANY($1::bigint[])', [programariCreate]);
        }
        if (angajatUserId) await pool.query('DELETE FROM users WHERE id = $1', [angajatUserId]);
        if (produsId) await pool.query('DELETE FROM produse WHERE id = $1', [produsId]);
        if (serviciuId) await pool.query('DELETE FROM servicii WHERE id = $1', [serviciuId]);
        if (clientUserId) await pool.query('DELETE FROM users WHERE id = $1', [clientUserId]);
        await pool.end();
    });

    async function creeazaProgramare() {
        const sloturi = await request(app)
            .get(`/api/angajati/${angajatId}/disponibilitate`)
            .query({ data: dataTest, serviciu_id: serviciuId })
            .set('Authorization', `Bearer ${tokenAdmin}`);
        const slotLiber = sloturi.body[0];

        const res = await request(app)
            .post('/api/programari')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ client_id: clientUserId, angajat_id: angajatId, serviciu_id: serviciuId, inceput: slotLiber.inceput });
        programariCreate.push(res.body.id);
        return res.body.id;
    }

    test('la finalizare, stocul scade automat cu cantitatea asociata serviciului', async () => {
        const progId = await creeazaProgramare();

        const finalizare = await request(app)
            .put(`/api/programari/${progId}/status`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ status: 'finalizata' });
        expect(finalizare.status).toBe(200);

        const produs = await request(app).get(`/api/produse/${produsId}`).set('Authorization', `Bearer ${tokenAdmin}`);
        expect(Number(produs.body.cantitate_stoc)).toBe(6); // 10 - 4

        const miscari = await request(app).get(`/api/produse/${produsId}/miscari`).set('Authorization', `Bearer ${tokenAdmin}`);
        expect(miscari.body.some((m) => m.programare_id === String(progId) && m.tip === 'iesire')).toBe(true);
    });

    test('re-finalizarea aceleiasi programari nu scade stocul a doua oara', async () => {
        const progId = programariCreate[0];

        await request(app)
            .put(`/api/programari/${progId}/status`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ status: 'finalizata' });

        const produs = await request(app).get(`/api/produse/${produsId}`).set('Authorization', `Bearer ${tokenAdmin}`);
        expect(Number(produs.body.cantitate_stoc)).toBe(6); // neschimbat
    });

    test('finalizarea emite automat o factura', async () => {
        const progId = programariCreate[0];
        const facturi = await request(app).get('/api/facturi').set('Authorization', `Bearer ${tokenAdmin}`);
        const factura = facturi.body.find((f) => f.programare_id === String(progId));

        expect(factura).toBeDefined();
        expect(factura.status).toBe('emisa');
        expect(Number(factura.total)).toBeCloseTo(50 * 1.19, 1); // pret serviciu + TVA 19%
    });

    test('stocul nu scade sub zero daca nu mai e suficient produs', async () => {
        // stoc ramas: 6, dar serviciul cere 4 -> a doua programare separata ar mai lua 4, ramanand 2;
        // fortam un caz cu stoc insuficient scazandu-l manual la 1 inainte de a doua programare
        await pool.query('UPDATE produse SET cantitate_stoc = 1 WHERE id = $1', [produsId]);

        const progId = await creeazaProgramare();
        const finalizare = await request(app)
            .put(`/api/programari/${progId}/status`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ status: 'finalizata' });
        expect(finalizare.status).toBe(200); // finalizarea nu trebuie blocata de stoc insuficient

        const produs = await request(app).get(`/api/produse/${produsId}`).set('Authorization', `Bearer ${tokenAdmin}`);
        expect(Number(produs.body.cantitate_stoc)).toBe(0); // s-a scazut doar cat exista, fara sa devina negativ
    });
});
