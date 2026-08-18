const router = require('express').Router();
const ctrl = require('../controllers/setari.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', ctrl.getSetari); // public - necesar pe pagina de rezervare
router.put('/', authenticate, authorize('admin'), ctrl.actualizeazaSetari);
router.put('/program', authenticate, authorize('admin'), ctrl.actualizeazaProgramSalon);

module.exports = router;
