// OpenAI Realtime API Session Token Generator
// Creates ephemeral tokens for client-side WebRTC connections

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY not configured');
        return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    try {
        const { instructions, voice = 'alloy' } = req.body || {};

        // Default system instructions for Mindclone personality
        const systemInstructions = instructions || `You are Mindclone, a warm and thoughtful AI companion. You are the user's friend, philosopher, and guide.

Your personality:
- Speak naturally and conversationally, like a wise friend
- Be empathetic, supportive, and genuinely interested in the user
- Share insights and perspectives that help the user grow
- Use a calm, warm tone - never robotic or formal
- Keep responses concise for voice (2-3 sentences typically)
- Ask thoughtful follow-up questions to deepen the conversation
- Remember context from the conversation and refer back to it

Voice guidelines:
- Speak at a natural pace, not too fast
- Use pauses for emphasis where appropriate
- Be expressive but not overly dramatic
- Match the user's energy level`;

        // Request ephemeral token from OpenAI
        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-realtime-preview-2024-12-17',
                voice: voice,
                instructions: systemInstructions,
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                input_audio_transcription: {
                    model: 'whisper-1'
                },
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API error:', response.status, errorText);

            if (response.status === 401) {
                return res.status(401).json({ error: 'Invalid OpenAI API key' });
            }
            if (response.status === 429) {
                return res.status(429).json({ error: 'Rate limit exceeded' });
            }

            return res.status(response.status).json({
                error: 'Failed to create realtime session',
                details: errorText
            });
        }

        const data = await response.json();

        // Return the client secret and session info
        return res.status(200).json({
            client_secret: data.client_secret,
            session_id: data.id,
            expires_at: data.expires_at,
            model: data.model,
            voice: data.voice
        });

    } catch (error) {
        console.error('Realtime session error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}
