// Remove a user from grandfathered status
require('dotenv').config({ path: '.env.production' });

const { initializeFirebaseAdmin, admin } = require('../api/_firebase-admin');

initializeFirebaseAdmin();
const db = admin.firestore();

async function removeGrandfathered(email) {
  console.log(`Removing grandfathered status for: ${email}`);

  // 1. Remove from pregrandfathered collection
  const preGrandfatheredRef = db.collection('pregrandfathered').doc(email);
  const preGrandfatheredDoc = await preGrandfatheredRef.get();

  if (preGrandfatheredDoc.exists) {
    await preGrandfatheredRef.delete();
    console.log(`✅ Removed from pregrandfathered collection`);
  } else {
    console.log(`ℹ️ Not found in pregrandfathered collection`);
  }

  // 2. Find user by email and remove isGrandfathered flag
  const usersSnapshot = await db.collection('users').where('email', '==', email).get();

  if (usersSnapshot.empty) {
    console.log(`ℹ️ No user found with email: ${email}`);
  } else {
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      if (userData.isGrandfathered) {
        await userDoc.ref.update({
          isGrandfathered: false,
          grandfatheredAt: admin.firestore.FieldValue.delete()
        });
        console.log(`✅ Removed isGrandfathered flag from user: ${userDoc.id}`);
      } else {
        console.log(`ℹ️ User ${userDoc.id} was not grandfathered`);
      }
    }
  }

  console.log(`\n✅ Done!`);
}

const email = process.argv[2] || 'virika.solanki@gmail.com';
removeGrandfathered(email)
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
