const webpush = require('web-push');
const db = require('../database/init');

const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails('mailto:lootgemshub@gmail.com', vapidPublic, vapidPrivate);
  console.log('Web Push initialized');
} else {
  console.log('Web Push: VAPID keys missing, web push disabled');
}

// Send web push to all subscribed desktop browsers
// messages: { ro: { title, body }, ru: { title, body } }
async function sendWebPushToStaff(messages, data) {
  if (!vapidPublic || !vapidPrivate) return;

  const subs = db.prepare('SELECT id, endpoint, p256dh, auth, lang FROM web_push_subs').all();
  if (subs.length === 0) return;

  for (const sub of subs) {
    const lang = sub.lang || 'ro';
    const msg = messages[lang] || messages.ro;
    const payload = JSON.stringify({
      title: msg.title,
      body: msg.body,
      data: data || {}
    });

    const pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth }
    };

    try {
      await webpush.sendNotification(pushSub, payload);
    } catch (err) {
      // Remove expired/invalid subscriptions
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM web_push_subs WHERE id = ?').run(sub.id);
      }
    }
  }
}

module.exports = { sendWebPushToStaff };
