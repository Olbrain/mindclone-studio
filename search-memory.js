// Load environment variables from .env.production
require('dotenv').config({ path: '.env.production' });

const { initializeFirebaseAdmin, admin } = require('./api/_firebase-admin');

// Initialize Firebase Admin
initializeFirebaseAdmin();

const db = admin.firestore();

async function searchMemory(searchTerm) {
  console.log(`Searching for "${searchTerm}" in all user messages...\n`);

  // Get all users
  const usersSnapshot = await db.collection('users').get();

  let totalFound = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();

    // Search messages
    const messagesSnapshot = await db.collection('users').doc(userId)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();

    const matches = [];
    messagesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.content && data.content.toLowerCase().includes(searchTerm.toLowerCase())) {
        matches.push({
          role: data.role,
          timestamp: data.timestamp?.toDate?.()?.toISOString() || 'N/A',
          content: data.content
        });
      }
    });

    if (matches.length > 0) {
      console.log(`=== User: ${userId} (${userData.email || userData.displayName || 'Unknown'}) ===`);
      console.log(`Found ${matches.length} messages mentioning "${searchTerm}":\n`);

      matches.forEach((match, i) => {
        console.log(`--- Message ${i + 1} ---`);
        console.log(`Role: ${match.role}`);
        console.log(`Time: ${match.timestamp}`);
        console.log(`Content: ${match.content.substring(0, 800)}${match.content.length > 800 ? '...' : ''}`);
        console.log('');
      });

      totalFound += matches.length;
    }
  }

  if (totalFound === 0) {
    console.log(`No messages found containing "${searchTerm}"`);
  } else {
    console.log(`\nTotal messages found: ${totalFound}`);
  }
}

const term = process.argv[2] || 'Virika';
searchMemory(term).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
