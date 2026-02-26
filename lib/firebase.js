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

// Send push notification to all registered staff devices
async function sendPushToStaff(title, body, data) {
  if (!admin.apps.length) return;

  const tokens = db.prepare('SELECT token FROM push_tokens').all().map(r => r.token);
  if (tokens.length === 0) return;

  const message = {
    notification: { title, body },
    data: data || {},
    android: {
      priority: 'high',
      notification: {
        sound: 'default'
      }
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
    console.error('FCM send error:', err.message);
  }
}

module.exports = { sendPushToStaff };
