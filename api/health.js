// Health check and diagnostics endpoint
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const diagnostics = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: {
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasFirebaseKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        firebaseKeyLength: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length || 0,
        nodeVersion: process.version,
      }
    };

    return res.status(200).json(diagnostics);
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
};
