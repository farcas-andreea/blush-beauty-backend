// Evita repetarea try/catch in fiecare controller: orice eroare aparuta
// intr-un handler async e trimisa automat mai departe catre errorHandler.
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
