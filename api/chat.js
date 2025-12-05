module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not found');
      return res.status(500).json({ 
        success: false, 
        error: 'API key not configured' 
      });
    }

    // Get request body
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Messages array required' 
      });
    }

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt || 'You are a helpful assistant.',
        messages: messages
      })
    });

    const data = await response.json();

    // Check for API errors
    if (!response.ok) {
      console.error('Anthropic API error:', data);
      return res.status(500).json({ 
        success: false, 
        error: data.error?.message || 'API request failed' 
      });
    }

    // Success!
    return res.status(200).json({
      success: true,
      content: data.content[0].text
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Server error' 
    });
  }
};
