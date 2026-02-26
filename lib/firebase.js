const admin = require('firebase-admin');
const db = require('../database/init');

// Initialize Firebase Admin from env vars (set on Zeabur)
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

if (projectId && clientEmail && privateKey) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
  });
  console.log('Firebase Admin initialized');
} else {
  console.log('Firebase Admin: env vars missing, push notifications disabled');
}

// Send localized push notification to all registered staff devices
// messages: { ro: { title, body }, ru: { title, body } }
async function sendPushToStaff(messages, data) {
  if (!admin.apps.length) return;

  const rows = db.prepare('SELECT token, lang FROM push_tokens').all();
  if (rows.length === 0) return;

  // Group tokens by language
  const byLang = {};
  for (const row of rows) {
    const lang = row.lang || 'ro';
    if (!byLang[lang]) byLang[lang] = [];
    byLang[lang].push(row.token);
  }

  for (const [lang, tokens] of Object.entries(byLang)) {
    const msg = messages[lang] || messages.ro;
    const message = {
      notification: { title: msg.title, body: msg.body },
      data: data || {},
      android: {
        priority: 'high',
        notification: { sound: 'default' }
      }
    };

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        ...message
      });

      // Remove invalid tokens
      if (response.responses) {
        response.responses.forEach((resp, i) => {
          if (!resp.success && resp.error) {
            const code = resp.error.code;
            if (code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered') {
              db.prepare('DELETE FROM push_tokens WHERE token = ?').run(tokens[i]);
            }
          }
        });
      }
    } catch (err) {
      console.error('FCM send error (' + lang + '):', err.message);
    }
  }
}

module.exports = { sendPushToStaff };
