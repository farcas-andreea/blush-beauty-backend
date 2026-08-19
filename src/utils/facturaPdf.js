const PDFDocument = require('pdfkit');

const AURIU = '#a8792f';
const NEGRU = '#2b2622';
const GRI = '#6b6258';

function formateazaData(data) {
    return new Date(data).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function ron(valoare) {
    return `${Number(valoare).toFixed(2)} RON`;
}

const ETICHETE_STATUS = { emisa: 'Emisa', platita: 'Platita', anulata: 'Anulata' };
const ETICHETE_PLATA = { numerar: 'Numerar', card: 'Card', transfer_bancar: 'Transfer bancar' };

// Genereaza documentul PDF al unei facturi si il scrie direct in stream-ul de raspuns (res).
// factura: randul din tabela facturi (+ client_nume, client_email)
// linii: randurile din factura_linii
// setari: randul din setari_salon (nume, adresa, oras, telefon, email) - poate fi null
function scrieFacturaPdf(res, factura, linii, setari) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${factura.numar_factura}.pdf"`);
    doc.pipe(res);

    // ---------- antet ----------
    doc.fontSize(22).fillColor(AURIU).text(setari?.nume || 'Blush Beauty Studio', { continued: false });
    doc.fontSize(9).fillColor(GRI);
    const adresa = [setari?.adresa, setari?.oras].filter(Boolean).join(', ');
    if (adresa) doc.text(adresa);
    if (setari?.telefon) doc.text(`Tel: ${setari.telefon}`);
    if (setari?.email) doc.text(setari.email);

    doc.moveDown(1.5);
    doc.fontSize(16).fillColor(NEGRU).text(`Factura ${factura.numar_factura}`);
    doc.fontSize(9).fillColor(GRI).text(`Data emiterii: ${formateazaData(factura.data_emiterii)}`);
    doc.text(`Status: ${ETICHETE_STATUS[factura.status] || factura.status}`);
    if (factura.metoda_plata) doc.text(`Metoda de plata: ${ETICHETE_PLATA[factura.metoda_plata] || factura.metoda_plata}`);
    if (factura.data_platii) doc.text(`Data platii: ${formateazaData(factura.data_platii)}`);

    doc.moveDown(1);
    doc.fontSize(11).fillColor(NEGRU).text('Client', { underline: true });
    doc.fontSize(10).fillColor(GRI).text(factura.client_nume);
    if (factura.client_email) doc.text(factura.client_email);

    // ---------- tabel linii ----------
    doc.moveDown(1.5);
    const startX = doc.x;
    let y = doc.y;
    const coloane = { descriere: startX, cant: startX + 260, pretUnitar: startX + 320, total: startX + 405 };
    const latimeTotal = 90; // suficient pentru "154.70 RON" fara ruptura de linie

    doc.fontSize(10).fillColor('#ffffff');
    doc.rect(startX, y, 495, 20).fill(AURIU);
    doc.fillColor('#ffffff');
    doc.text('Descriere', coloane.descriere + 8, y + 5);
    doc.text('Cant.', coloane.cant, y + 5);
    doc.text('Pret unitar', coloane.pretUnitar, y + 5);
    doc.text('Total', coloane.total, y + 5);
    y += 24;

    doc.fillColor(NEGRU).fontSize(10);
    linii.forEach((linie, index) => {
        if (index % 2 === 1) {
            doc.rect(startX, y - 3, 495, 20).fill('#f5f0e8');
            doc.fillColor(NEGRU);
        }
        doc.text(linie.descriere, coloane.descriere + 8, y, { width: 240 });
        doc.text(String(Number(linie.cantitate)), coloane.cant, y);
        doc.text(ron(linie.pret_unitar), coloane.pretUnitar, y);
        doc.text(ron(linie.total_linie), coloane.total, y, { width: latimeTotal, lineBreak: false });
        y += 20;
    });

    // ---------- totaluri ----------
    y += 10;
    doc.moveTo(coloane.pretUnitar, y).lineTo(startX + 495, y).strokeColor('#dcd4c4').stroke();
    y += 8;
    doc.fontSize(10).fillColor(GRI).text('Subtotal', coloane.pretUnitar, y);
    doc.fillColor(NEGRU).text(ron(factura.subtotal), coloane.total, y, { width: latimeTotal, lineBreak: false });
    y += 16;
    doc.fillColor(GRI).text('TVA (19%)', coloane.pretUnitar, y);
    doc.fillColor(NEGRU).text(ron(factura.tva), coloane.total, y, { width: latimeTotal, lineBreak: false });
    y += 18;
    doc.fontSize(12).fillColor(AURIU).text('Total', coloane.pretUnitar, y);
    doc.text(ron(factura.total), coloane.total, y, { width: latimeTotal, lineBreak: false });

    // ---------- subsol ----------
    doc.fontSize(8).fillColor(GRI).text(
        'Document generat automat de aplicatia de gestiune Blush Beauty Studio.',
        50,
        doc.page.height - 60,
        { align: 'center', width: doc.page.width - 100 }
    );

    doc.end();
}

module.exports = { scrieFacturaPdf };
