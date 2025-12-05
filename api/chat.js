import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, mindclone, training, history } = req.body;

    // Build system prompt from mindclone identity and training data
    const systemPrompt = `You are a Neural Ally - a personal AI companion trained on the following information about me:

My Name: ${mindclone.name}
My Core Values: ${mindclone.values}
My Communication Style: ${mindclone.style}
My Knowledge Domains: ${mindclone.domains}
About Me: ${mindclone.context}

Key Memories:
${training.memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}

My Beliefs:
${training.beliefs.map((b, i) => `${i + 1}. ${b}`).join('\n')}

My Knowledge:
${training.knowledge.map((k, i) => `${i + 1}. ${k}`).join('\n')}

Based on this context, I should respond in a way that aligns with their personality, values, and communication style. I am loyal, helpful, and deeply understand their perspective.`;

    // Prepare conversation history for Claude
    const messages = history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // Add the current message
    messages.push({
      role: 'user',
      content: message,
    });

    // Call Claude API
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    });

    const assistantMessage = response.content[0].text;

    res.status(200).json({
      response: assistantMessage,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}
