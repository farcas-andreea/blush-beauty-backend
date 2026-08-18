const { Pool } = require('pg');

// Pool de conexiuni catre PostgreSQL (Supabase).
// Toate query-urile din aplicatie trec prin acest pool.
const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false } // necesar pentru conexiunea catre Supabase
});

pool.on('error', (err) => {
    console.error('Eroare neasteptata pe conexiunea la baza de date:', err);
});

// Helper simplu pentru query-uri, folosit in toate controllerele.
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
