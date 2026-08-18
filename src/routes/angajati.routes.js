const router = require('express').Router();
const ctrl = require('../controllers/angajati.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// Permite accesul adminului SAU angajatului care isi gestioneaza propriul program.
const adminSauProprietar = asyncHandler(async (req, res, next) => {
    if (req.user.rol === 'admin') return next();
    if (req.user.rol === 'angajat') {
        const { rows } = await query('SELECT id FROM angajati WHERE id = $1 AND user_id = $2', [
            req.params.id,
            req.user.id
        ]);
        if (rows[0]) return next();
    }
    return res.status(403).json({ mesaj: 'Nu ai permisiunea sa modifici aceasta resursa.' });
});

router.get('/', ctrl.listaAngajati); // public - necesar la rezervare

// IMPORTANT: /cont-propriu trebuie definit inaintea lui /:id
router.get('/cont-propriu', authenticate, authorize('angajat'), ctrl.contPropriu);

router.get('/:id', ctrl.detaliuAngajat);
router.post('/', authenticate, authorize('admin'), ctrl.creeazaAngajat);
router.put('/:id', authenticate, authorize('admin'), ctrl.actualizeazaAngajat);
router.delete('/:id', authenticate, authorize('admin'), ctrl.stergeAngajat);

router.put('/:id/servicii', authenticate, authorize('admin'), ctrl.seteazaServiciiAngajat);

router.get('/:id/program', ctrl.listaProgram); // public - necesar la calculul disponibilitatii
router.put('/:id/program', authenticate, adminSauProprietar, ctrl.seteazaProgram);
router.get('/:id/disponibilitate', ctrl.disponibilitate); // public - folosit in formularul de rezervare

router.get('/:id/zile-libere', authenticate, adminSauProprietar, ctrl.listaZileLibere);
router.post('/:id/zile-libere', authenticate, adminSauProprietar, ctrl.adaugaZiLibera);
router.delete('/:id/zile-libere/:ziId', authenticate, adminSauProprietar, ctrl.stergeZiLibera);

module.exports = router;
