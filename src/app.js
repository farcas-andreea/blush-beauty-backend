require('dotenv').config();
const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

// Aplicatia Express, separata de pornirea efectiva a serverului (app.listen).
// Separarea permite testelor (Jest + Supertest) sa importe aplicatia si sa-i
// trimita cereri direct, in memorie, fara sa deschida un port real.
const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Serverul Blush Beauty Studio functioneaza cu succes!');
});

app.use('/api', routes);

// Ruta necunoscuta -> 404
app.use((req, res) => {
    res.status(404).json({ mesaj: 'Ruta ceruta nu exista.' });
});

// Trebuie sa fie ultimul middleware inregistrat
app.use(errorHandler);

module.exports = app;
