const router = require('express').Router();
const { inregistrare, login, profilCurent } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

router.post('/inregistrare', inregistrare);
router.post('/login', login);
router.get('/eu', authenticate, profilCurent);

module.exports = router;
