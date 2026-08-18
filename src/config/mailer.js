const nodemailer = require('nodemailer');

let transporterPromise = null;

// Daca sunt completate credentialele SMTP in .env, trimitem prin serverul real.
// Altfel, folosim automat un cont de test Ethereal (nodemailer.createTestAccount) -
// e-mailurile nu ajung intr-o casuta reala, dar primim un link de previzualizare,
// perfect pentru dezvoltare/demo fara sa fie nevoie de credentiale reale.
function creeazaTransporter() {
    if (transporterPromise) return transporterPromise;

    transporterPromise = (async () => {
        if (process.env.SMTP_HOST) {
            return {
                transporter: nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: Number(process.env.SMTP_PORT) || 587,
                    secure: Number(process.env.SMTP_PORT) === 465,
                    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
                }),
                foloseseEthereal: false
            };
        }

        const contTest = await nodemailer.createTestAccount();
        console.log('[email] Nu exista SMTP_HOST in .env -> folosesc cont de test Ethereal.');
        console.log(`[email] Login Ethereal (optional, pentru inbox): ${contTest.user} / ${contTest.pass}`);
        return {
            transporter: nodemailer.createTransport({
                host: contTest.smtp.host,
                port: contTest.smtp.port,
                secure: contTest.smtp.secure,
                auth: { user: contTest.user, pass: contTest.pass }
            }),
            foloseseEthereal: true
        };
    })();

    return transporterPromise;
}

module.exports = { creeazaTransporter };
