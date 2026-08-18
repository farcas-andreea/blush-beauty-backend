const router = require('express').Router();
const ctrl = require('../controllers/notificari.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/trimite-remindere', authenticate, authorize('admin'), ctrl.trimiteRemindere);

module.exports = router;
