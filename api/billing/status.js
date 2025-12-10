// Billing Status API - Get user's subscription status
const { initializeFirebaseAdmin, admin } = require('../_firebase-admin');
const { getSubscriptionSummary } = require('../_billing-helpers');

// Initialize Firebase Admin SDK
initializeFirebaseAdmin();
const db = admin.firestore();

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify Firebase ID token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;

    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authError) {
      console.error('[Billing Status] Token verification failed:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = decodedToken.uid;

    // Get user document
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    // Get subscription summary
    const summary = getSubscriptionSummary(userData);

    return res.status(200).json(summary);

  } catch (error) {
    console.error('[Billing Status] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
