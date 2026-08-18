const router = require('express').Router();
const ctrl = require('../controllers/servicii.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Lista serviciilor e publica (necesara paginii de rezervare, fara login).
// Daca userul e autentificat, middleware-ul optional populeaza req.user pentru filtrul ?toate=1.
const { optionalAuth } = require('../middleware/optionalAuth');

router.get('/', optionalAuth, ctrl.listaServicii);
router.get('/:id', ctrl.detaliuServiciu);
router.post('/', authenticate, authorize('admin'), ctrl.creeazaServiciu);
router.put('/:id', authenticate, authorize('admin'), ctrl.actualizeazaServiciu);
router.delete('/:id', authenticate, authorize('admin'), ctrl.stergeServiciu);

router.get('/:id/produse', authenticate, authorize('admin'), ctrl.listaProduseServiciu);
router.put('/:id/produse', authenticate, authorize('admin'), ctrl.seteazaProduseServiciu);

module.exports = router;
