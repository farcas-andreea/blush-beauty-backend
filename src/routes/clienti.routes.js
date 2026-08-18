const router = require('express').Router();
const ctrl = require('../controllers/clienti.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Vizibil pentru admin si angajati (au nevoie de datele clientului la receptie).
router.use(authenticate, authorize('admin', 'angajat'));

router.get('/', ctrl.listaClienti);
router.get('/:id', ctrl.detaliuClient);
router.post('/', ctrl.creeazaClient);
router.put('/:id', ctrl.actualizeazaClient);

module.exports = router;
