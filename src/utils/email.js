const nodemailer = require('nodemailer');
const { creeazaTransporter } = require('../config/mailer');
const { query } = require('../config/db');

function formateazaData(inceput) {
    const d = new Date(inceput);
    return {
        data: d.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' }),
        ora: d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
    };
}

const SUBIECTE = {
    confirmare: 'Programarea ta a fost inregistrata',
    reminder: 'Reminder: ai o programare maine',
    anulare: 'Programarea ta a fost anulata'
};

function construiesteContinut(tip, programare) {
    const { data, ora } = formateazaData(programare.inceput);
    const antet = `<div style="font-family: Segoe UI, sans-serif; color:#2b2b2b;">
        <h2 style="color:#a8577a; font-family: Georgia, serif; letter-spacing: 0.5px;">Blush Beauty Studio</h2>`;
    const subsol = `</div>`;

    const detalii = `
        <p><strong>Serviciu:</strong> ${programare.serviciu_nume}</p>
        <p><strong>Specialist:</strong> ${programare.angajat_nume}</p>
        <p><strong>Data:</strong> ${data}</p>
        <p><strong>Ora:</strong> ${ora}</p>
    `;

    if (tip === 'confirmare') {
        return `${antet}<p>Buna, ${programare.client_nume}!</p>
            <p>Programarea ta a fost inregistrata cu succes:</p>
            ${detalii}
            <p>Te asteptam!</p>${subsol}`;
    }
    if (tip === 'reminder') {
        return `${antet}<p>Buna, ${programare.client_nume}!</p>
            <p>Iti reamintim ca ai o programare <strong>maine</strong>:</p>
            ${detalii}
            <p>Pe curand!</p>${subsol}`;
    }
    return `${antet}<p>Buna, ${programare.client_nume}!</p>
        <p>Programarea ta a fost anulata:</p>
        ${detalii}
        <p>Daca vrei sa faci o programare noua, te asteptam pe site.</p>${subsol}`;
}

// Trimite un email legat de o programare (confirmare/reminder/anulare) si inregistreaza
// incercarea in tabela notificari, indiferent daca a reusit sau nu.
async function trimiteEmailProgramare(tip, programare) {
    let statusFinal = 'trimisa';
    let previzualizareUrl = null;

    try {
        const { transporter, foloseseEthereal } = await creeazaTransporter();
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || 'Blush Beauty Studio <no-reply@blushbeauty.ro>',
            to: programare.client_email,
            subject: SUBIECTE[tip],
            html: construiesteContinut(tip, programare)
        });

        if (foloseseEthereal) {
            previzualizareUrl = nodemailer.getTestMessageUrl(info);
            console.log(`[email] (${tip}) previzualizare: ${previzualizareUrl}`);
        }
    } catch (err) {
        console.error(`[email] Nu am putut trimite emailul de ${tip}:`, err.message);
        statusFinal = 'eroare';
    }

    await query(
        `INSERT INTO notificari (programare_id, tip, canal, status, trimisa_la)
         VALUES ($1, $2, 'email', $3, now())`,
        [programare.id, tip, statusFinal]
    );

    return { status: statusFinal, previzualizareUrl };
}

module.exports = { trimiteEmailProgramare };
