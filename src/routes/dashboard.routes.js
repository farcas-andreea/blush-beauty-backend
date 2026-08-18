const router = require('express').Router();
const ctrl = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/statistici', authenticate, authorize('admin'), ctrl.statistici);

module.exports = router;
