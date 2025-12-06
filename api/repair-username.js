// Temporary admin endpoint to repair username data inconsistency
const { initializeFirebaseAdmin, admin } = require('./_firebase-admin');

// Initialize Firebase Admin SDK
initializeFirebaseAdmin();
const db = admin.firestore();

// Verify Firebase ID token
async function verifyToken(idToken) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

// Repair username data
async function repairUsername(userId) {
  try {
    console.log('[Repair] Starting repair for user:', userId);

    // Find username claimed by this user
    const usernamesSnapshot = await db.collection('usernames')
      .where('userId', '==', userId)
      .get();

    if (usernamesSnapshot.empty) {
      console.log('[Repair] No username found for this user');
      return {
        repaired: false,
        message: 'No username found for this user'
      };
    }

    const usernameDoc = usernamesSnapshot.docs[0];
    const username = usernameDoc.id;

    console.log('[Repair] Found username:', username);

    // Update user document with the username
    await db.collection('users').doc(userId).set({
      username: username,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('[Repair] Successfully updated user document');

    return {
      repaired: true,
      username: username,
      message: `Successfully repaired username: ${username}`
    };
  } catch (error) {
    console.error('[Repair] Error:', error);
    throw error;
  }
}

// Main handler
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from Authorization header or body
    const authHeader = req.headers.authorization;
    const idToken = authHeader ? authHeader.replace('Bearer ', '') : req.body?.idToken;

    if (!idToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = await verifyToken(idToken);

    console.log('[Repair] Repairing username for userId:', userId);

    const result = await repairUsername(userId);

    return res.status(200).json(result);
  } catch (error) {
    console.error('[Repair] Repair username error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
};
