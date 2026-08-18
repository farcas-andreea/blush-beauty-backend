const router = require('express').Router();
const ctrl = require('../controllers/programari.controller');
const { authenticate } = require('../middleware/auth');

// Toate rutele de programari cer autentificare (client, angajat sau admin).
router.use(authenticate);

router.get('/', ctrl.listaProgramari);
router.get('/:id', ctrl.detaliuProgramare);
router.post('/', ctrl.creeazaProgramare);
router.put('/:id/status', ctrl.actualizeazaStatus);

module.exports = router;
