const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/servicii', require('./servicii.routes'));
router.use('/angajati', require('./angajati.routes'));
router.use('/programari', require('./programari.routes'));
router.use('/clienti', require('./clienti.routes'));
router.use('/produse', require('./produse.routes'));
router.use('/facturi', require('./facturi.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/notificari', require('./notificari.routes'));
router.use('/setari', require('./setari.routes'));

module.exports = router;
