const { app, request, idUnic } = require('./helpers');
const { pool } = require('../src/config/db');

describe('Autentificare', () => {
    const emailTest = `test.auth.${idUnic()}@exemplu.ro`;
    let userIdCreat;

    afterAll(async () => {
        if (userIdCreat) await pool.query('DELETE FROM users WHERE id = $1', [userIdCreat]);
        await pool.end();
    });

    test('inregistrare cu date valide creeaza un cont de client si returneaza token', async () => {
        const res = await request(app).post('/api/auth/inregistrare').send({
            nume: 'Client Test',
            email: emailTest,
            parola: 'Parola123!',
            telefon: '0711111111'
        });

        expect(res.status).toBe(201);
        expect(res.body.token).toBeDefined();
        expect(res.body.user.rol).toBe('client');
        expect(res.body.user.email).toBe(emailTest);
        userIdCreat = res.body.user.id;
    });

    test('inregistrare cu acelasi email a doua oara este respinsa (email duplicat)', async () => {
        const res = await request(app).post('/api/auth/inregistrare').send({
            nume: 'Client Test',
            email: emailTest,
            parola: 'Parola123!'
        });
        expect(res.status).toBe(409);
    });

    test('inregistrare fara parola este respinsa', async () => {
        const res = await request(app).post('/api/auth/inregistrare').send({
            nume: 'Fara Parola',
            email: `test.${idUnic()}@exemplu.ro`
        });
        expect(res.status).toBe(400);
    });

    test('login cu credentiale corecte de admin functioneaza', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'admin@salon.ro', parola: 'Admin123!' });
        expect(res.status).toBe(200);
        expect(res.body.user.rol).toBe('admin');
        expect(res.body.token).toBeDefined();
    });

    test('login cu parola gresita este respins', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'admin@salon.ro', parola: 'parola-gresita' });
        expect(res.status).toBe(401);
    });

    test('GET /api/auth/eu fara token este respins', async () => {
        const res = await request(app).get('/api/auth/eu');
        expect(res.status).toBe(401);
    });

    test('GET /api/auth/eu cu token valid returneaza profilul propriu', async () => {
        const login = await request(app).post('/api/auth/login').send({ email: emailTest, parola: 'Parola123!' });
        const res = await request(app).get('/api/auth/eu').set('Authorization', `Bearer ${login.body.token}`);
        expect(res.status).toBe(200);
        expect(res.body.email).toBe(emailTest);
    });
});
