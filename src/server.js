const cron = require('node-cron');
const app = require('./app');
const { trimiteRemindereZiUrmatoare } = require('./controllers/notificari.controller');

const PORT = process.env.PORT || 5000;

// In fiecare zi la 09:00, trimite remindere pentru programarile din ziua urmatoare.
// (declansabil si manual din panoul de admin, prin POST /api/notificari/trimite-remindere)
cron.schedule('0 9 * * *', () => {
    trimiteRemindereZiUrmatoare().catch((err) => console.error('[cron] Eroare la trimiterea remindere-lor:', err));
});

app.listen(PORT, () => {
    console.log(`Serverul ruleaza pe http://localhost:${PORT}`);
});
