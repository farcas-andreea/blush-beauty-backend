// Middleware central de tratare a erorilor. Traduce erorile PostgreSQL
// comune in mesaje intelese de client, in loc sa scurgem detalii interne.
function errorHandler(err, req, res, next) {
    console.error(err);

    // cod unic (ex: email deja folosit, numar factura duplicat)
    if (err.code === '23505') {
        return res.status(409).json({ mesaj: 'Aceasta inregistrare exista deja.' });
    }

    // incalcare exclusion constraint -> suprapunere programari
    if (err.code === '23P01') {
        return res.status(409).json({ mesaj: 'Intervalul se suprapune cu o alta programare a angajatului.' });
    }

    // foreign key invalid
    if (err.code === '23503') {
        return res.status(400).json({ mesaj: 'Referinta invalida catre o alta inregistrare.' });
    }

    const status = err.status || 500;
    res.status(status).json({ mesaj: err.mesaj || err.message || 'Eroare interna de server.' });
}

module.exports = errorHandler;
