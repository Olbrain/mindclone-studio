// CORRECTED VERSION - Mindclone Studio Chat API Handler
// This version fixes the export format for Vercel and adds comprehensive logging

const { GoogleGenerativeAI } = require('@google/generative-ai');

// This is the CORRECT export format for Vercel serverless functions
module.exports = async (req, res) => {
  // Log everything for debugging
  console.log('=== CHAT API CALLED ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Environment variables available:', Object.keys(process.env).filter(k => k.includes('GEMINI') || k.includes('API')));
  
  // CORS headers - MUST come before any response
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request (CORS preflight)
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return res.status(200).end();
  }
  
  // Handle GET request (health check)
  if (req.method === 'GET') {
    console.log('Handling GET request - health check');
    const apiKeyExists = !!process.env.GEMINI_API_KEY;
    return res.status(200).json({
      status: 'ok',
      provider: 'gemini',
      model: 'gemini-pro',
      apiKeyConfigured: apiKeyExists,
      message: 'Chat API is running'
    });
  }
  
  // Handle POST request (actual chat)
  if (req.method === 'POST') {
    console.log('Handling POST request - chat message');
    
    try {
      // Check for API key
      const apiKey = process.env.GEMINI_API_KEY;
      console.log('API Key check:', apiKey ? 'EXISTS (length: ' + apiKey.length + ')' : 'MISSING');
      
      if (!apiKey) {
        console.error('ERROR: GEMINI_API_KEY not found in environment variables');
        return res.status(500).json({
          error: 'API key not configured. Please add GEMINI_API_KEY to environment variables.',
          debug: {
            availableEnvVars: Object.keys(process.env).filter(k => k.includes('GEMINI') || k.includes('API'))
          }
        });
      }
      
      // Get message from request
      const { message, conversationHistory = [] } = req.body;
      console.log('User message:', message);
      console.log('Conversation history length:', conversationHistory.length);
      
      if (!message) {
        console.error('ERROR: No message provided');
        return res.status(400).json({ error: 'Message is required' });
      }
      
      // Initialize Gemini
      console.log('Initializing Gemini AI...');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      
      // Build conversation context
      let prompt = message;
      if (conversationHistory && conversationHistory.length > 0) {
        const context = conversationHistory
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n');
        prompt = `${context}\nUser: ${message}\nAssistant:`;
      }
      
      console.log('Sending request to Gemini...');
      
      // Generate response
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      console.log('Gemini response received, length:', text.length);
      console.log('First 100 chars:', text.substring(0, 100));
      
      return res.status(200).json({
        response: text,
        provider: 'gemini',
        model: 'gemini-pro'
      });
      
    } catch (error) {
      console.error('=== ERROR IN CHAT API ===');
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      return res.status(500).json({
        error: 'Failed to generate response',
        details: error.message,
        provider: 'gemini'
      });
    }
  }
  
  // Method not allowed
  console.log('Method not allowed:', req.method);
  return res.status(405).json({ error: 'Method not allowed' });
};
