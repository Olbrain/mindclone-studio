// File upload endpoint for documents and media
const { put } = require('@vercel/blob');
const { initializeFirebaseAdmin, admin } = require('./_firebase-admin');

// Initialize Firebase
initializeFirebaseAdmin();
const db = admin.firestore();

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
    console.log('[Upload] Starting file upload process');

    // Get user ID from request (assuming it's passed in headers or body)
    const userId = req.headers['x-user-id'] || req.body?.userId;

    if (!userId) {
      console.error('[Upload] No user ID provided');
      return res.status(401).json({ error: 'Unauthorized - User ID required' });
    }

    // Verify user exists
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.error('[Upload] User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    // Parse the request body to get file data
    // Note: Vercel expects base64 encoded file data in body.file
    const { file, filename, contentType, section, type } = req.body;

    if (!file || !filename) {
      console.error('[Upload] Missing required fields');
      return res.status(400).json({ error: 'Missing required fields: file and filename' });
    }

    console.log('[Upload] Uploading file:', {
      filename,
      contentType: contentType || 'application/octet-stream',
      section,
      type
    });

    // Convert base64 to Buffer
    const fileBuffer = Buffer.from(file, 'base64');
    const fileSizeBytes = fileBuffer.length;

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFilename = `${userId}/${timestamp}-${filename}`;

    // Upload to Vercel Blob
    const blob = await put(uniqueFilename, fileBuffer, {
      access: 'public',
      contentType: contentType || 'application/octet-stream',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    console.log('[Upload] File uploaded successfully:', blob.url);

    // Return success response
    const response = {
      success: true,
      url: blob.url,
      metadata: {
        filename,
        uniqueFilename,
        size: fileSizeBytes,
        contentType: contentType || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        section: section || null,
        type: type || 'document'
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('[Upload] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to upload file',
      details: error.toString()
    });
  }
};
