const router = require('express').Router();
const ctrl = require('../controllers/produse.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('admin', 'angajat'));

// IMPORTANT: /stoc-scazut trebuie definit inaintea lui /:id, altfel Express
// il interpreteaza pe "stoc-scazut" ca fiind un :id.
router.get('/stoc-scazut', ctrl.listaStocScazut);

router.get('/', ctrl.listaProduse);
router.get('/:id', ctrl.detaliuProdus);
router.post('/', authorize('admin'), ctrl.creeazaProdus);
router.put('/:id', authorize('admin'), ctrl.actualizeazaProdus);
router.delete('/:id', authorize('admin'), ctrl.stergeProdus);

router.get('/:id/miscari', ctrl.listaMiscariStoc);
router.post('/:id/miscari', ctrl.adaugaMiscareStoc);

module.exports = router;
