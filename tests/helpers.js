const request = require('supertest');
const app = require('../src/app');

// Autentificare ca admin, folosita in majoritatea testelor pentru a crea date de test.
async function autentificaAdmin() {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@salon.ro', parola: 'Admin123!' });
    if (res.status !== 200) {
        throw new Error(`Login admin esuat in teste: ${JSON.stringify(res.body)}`);
    }
    return res.body.token;
}

// Genereaza un identificator unic per rulare de teste, ca sa nu se ciocneasca
// emailurile la rulari repetate (testele lucreaza pe aceeasi baza de date reala).
function idUnic() {
    return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

module.exports = { app, request, autentificaAdmin, idUnic };
