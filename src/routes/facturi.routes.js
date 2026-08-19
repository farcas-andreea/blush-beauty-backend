const router = require('express').Router();
const ctrl = require('../controllers/facturi.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/proprii', ctrl.facturileMele); // clientul isi vede propriile facturi
router.get('/:id', ctrl.detaliuFactura); // verificare de acces facuta in controller
router.get('/:id/pdf', ctrl.descarcaFacturaPdf); // verificare de acces facuta in controller

router.get('/', authorize('admin', 'angajat'), ctrl.listaFacturi);
router.post('/', authorize('admin', 'angajat'), ctrl.creeazaFactura);
router.put('/:id/status', authorize('admin', 'angajat'), ctrl.actualizeazaStatusFactura);

module.exports = router;
