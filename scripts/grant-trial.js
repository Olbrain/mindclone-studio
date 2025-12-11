// Grant a 7-day trial to a user
require('dotenv').config({ path: '.env.production' });

const { initializeFirebaseAdmin, admin } = require('../api/_firebase-admin');

initializeFirebaseAdmin();
const db = admin.firestore();

async function grantTrial(email, days = 7) {
  console.log(`Granting ${days}-day trial to: ${email}`);

  // Find user by email
  const usersSnapshot = await db.collection('users').where('email', '==', email).get();

  if (usersSnapshot.empty) {
    console.log(`No user found with email: ${email}`);
    return;
  }

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + days);

  for (const userDoc of usersSnapshot.docs) {
    await userDoc.ref.update({
      billing: {
        status: 'created',
        trialEnd: trialEnd,
        trialStarted: admin.firestore.FieldValue.serverTimestamp()
      }
    });
    console.log(`Granted ${days}-day trial to user: ${userDoc.id}`);
    console.log(`Trial ends: ${trialEnd.toISOString()}`);
  }

  console.log(`\nDone!`);
}

const email = process.argv[2] || 'virika.solanki@gmail.com';
const days = parseInt(process.argv[3]) || 7;
grantTrial(email, days)
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
