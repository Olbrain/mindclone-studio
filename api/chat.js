// Mindclone Studio Chat API Handler - OpenAI Version
// This handles requests to /api/chat using OpenAI's GPT API

module.exports = async function handler(req, res) {
  // Set CORS headers to allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET requests - return API info
  if (req.method === 'GET') {
    return res.status(200).json({
      service: 'Mindclone Studio Chat API',
      status: 'operational',
      version: '1.0.0',
      provider: 'OpenAI',
      model: 'gpt-4o-mini',
      methods: ['POST'],
      message: 'Send POST requests with messages array to use this API',
      timestamp: new Date().toISOString()
    });
  }

  // Only allow POST for actual chat requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use POST to send messages.' 
    });
  }

  try {
    // Check if API key exists
    const apiKey = "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";
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY not found in environment variables');
      return res.status(500).json({ 
        success: false, 
        error: 'API key not configured. Please add OPENAI_API_KEY to environment variables.' 
      });
    }

    // Log incoming request (helpful for debugging)
    console.log('✅ Received chat request:', {
      timestamp: new Date().toISOString(),
      hasMessages: !!req.body?.messages,
      messageCount: req.body?.messages?.length || 0
    });

    // Get request body
    const { messages, systemPrompt } = req.body;

    // Validate messages
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Messages array is required' 
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Messages array cannot be empty' 
      });
    }

    // Build messages array for OpenAI
    const openaiMessages = [];

    // Add system prompt if provided
    if (systemPrompt) {
      openaiMessages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    // Add conversation messages
    openaiMessages.push(...messages);

    // Call OpenAI API
    console.log('📤 Calling OpenAI API...');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Fast and cost-effective model
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    const data = await response.json();

    // Check for OpenAI API errors
    if (!response.ok) {
      console.error('❌ OpenAI API error:', {
        status: response.status,
        error: data.error
      });
      return res.status(500).json({ 
        success: false, 
        error: data.error?.message || 'Failed to get response from AI' 
      });
    }

    // Extract the response text
    const aiResponse = data.choices?.[0]?.message?.content;
    
    if (!aiResponse) {
      console.error('❌ Unexpected OpenAI response format:', data);
      return res.status(500).json({ 
        success: false, 
        error: 'Unexpected response format from AI' 
      });
    }

    // Success! Return the AI's response
    console.log('✅ Successfully received OpenAI response');
    return res.status(200).json({
      success: true,
      content: aiResponse,
      model: 'gpt-4o-mini',
      provider: 'OpenAI'
    });

  } catch (error) {
    // Catch any unexpected errors
    console.error('❌ Server error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    });
  }
};
