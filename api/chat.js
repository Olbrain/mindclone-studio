// Gemini API handler with Mem0 integration and Tool Calling
const { CONNOISSEUR_STYLE_GUIDE } = require('./_style-guide');
const { MemoryClient } = require('mem0ai');
const { initializeFirebaseAdmin, admin } = require('./_firebase-admin');
const { computeAccessLevel } = require('./_billing-helpers');

// Initialize Firebase Admin SDK
initializeFirebaseAdmin();
const db = admin.firestore();

// Initialize Mem0 client (reuse across requests)
let memoryClient = null;

function getMemoryClient() {
  if (!memoryClient && process.env.MEM0_API_KEY) {
    memoryClient = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });
  }
  return memoryClient;
}

// ===================== TOOL DEFINITIONS =====================
const tools = [
  {
    function_declarations: [
      {
        name: "get_link_settings",
        description: "Get the current public link settings including username, link status, display name, bio, greeting, and knowledge base status. Use this when the user asks about their link settings, configuration, or wants to know their current setup.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "update_link_settings",
        description: "Update public link settings. Use this when the user wants to change their link configuration - like enabling/disabling the link, changing display name, bio, or greeting. You can update one or multiple settings at once.",
        parameters: {
          type: "object",
          properties: {
            linkEnabled: {
              type: "boolean",
              description: "Enable or disable the public link"
            },
            displayName: {
              type: "string",
              description: "The name displayed on the public link page"
            },
            bio: {
              type: "string",
              description: "A short bio about the user (max 200 characters)"
            },
            customGreeting: {
              type: "string",
              description: "Custom greeting message shown to visitors when they open the link"
            },
            knowledgeBaseEnabled: {
              type: "boolean",
              description: "Enable or disable knowledge base for link conversations"
            }
          },
          required: []
        }
      },
      {
        name: "get_knowledge_base",
        description: "Get information about the user's knowledge base documents. Use this when the user asks about their uploaded documents, knowledge base, or what files they have shared.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "get_link_conversations",
        description: "Get recent visitor conversations from the user's public link. Use this when the user asks about what visitors are discussing, popular topics, what people are asking about, conversation history, or wants to analyze their link engagement. Returns the actual messages exchanged between visitors and the mindclone.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of visitors to fetch (default 20, max 50)"
            },
            includeFullConversations: {
              type: "boolean",
              description: "If true, fetch full conversation history for each visitor. If false (default), only fetch the last few messages per visitor."
            }
          },
          required: []
        }
      },
      {
        name: "search_memory",
        description: "Search through all past conversations to find specific information, names, topics, or context. AUTOMATICALLY use this tool when: (1) You encounter an unfamiliar name (person, place, project, pet, etc.), (2) The user asks 'remember when...', 'what did I say about...', or similar recall questions, (3) You need context about something previously discussed, (4) The user mentions something you should know but don't recognize. This searches the ACTUAL conversation history stored in the database, not just extracted memories.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search term - a name, topic, keyword, or phrase to search for in past conversations"
            },
            limit: {
              type: "number",
              description: "Maximum number of messages to return (default 20, max 50)"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "browse_url",
        description: "Fetch and read the content of a web page. Use this when the user asks you to look at a website, check a URL, read an article, or view content from the internet. Returns the text content of the page.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The full URL to fetch (must include http:// or https://)"
            }
          },
          required: ["url"]
        }
      },
      {
        name: "analyze_image",
        description: "Analyze an image from a URL using vision AI. Use this when the user asks you to look at, describe, or analyze an image, photo, or picture from the internet. Can identify objects, people, scenes, text in images, and more. For recognizing the user in photos, use the context from their knowledge base about their appearance.",
        parameters: {
          type: "object",
          properties: {
            image_url: {
              type: "string",
              description: "The full URL of the image to analyze (must be a direct image URL ending in .jpg, .png, .gif, .webp, or similar)"
            },
            question: {
              type: "string",
              description: "Optional specific question about the image (e.g., 'Is there a person in this image?', 'What products are shown?'). If not provided, will give a general description."
            }
          },
          required: ["image_url"]
        }
      }
    ]
  }
];

// ===================== TOOL HANDLERS =====================

// Get link settings from Firestore
async function handleGetLinkSettings(userId) {
  try {
    // Get user document
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};

    // Get link settings
    const settingsDoc = await db.collection('users').doc(userId)
      .collection('linkSettings').doc('config').get();
    const settingsData = settingsDoc.data() || {};

    const publicLinkUrl = userData.username ? `https://mindclone.link/${userData.username}` : null;

    return {
      success: true,
      settings: {
        username: userData.username || null,
        publicLinkUrl: publicLinkUrl,
        linkEnabled: userData.linkEnabled || false,
        displayName: settingsData.displayName || userData.displayName || '',
        bio: settingsData.bio || '',
        customGreeting: settingsData.customGreeting || '',
        knowledgeBaseEnabled: userData.knowledgeBaseEnabled || false
      }
    };
  } catch (error) {
    console.error('[Tool] Error getting link settings:', error);
    return { success: false, error: error.message };
  }
}

// Update link settings in Firestore
async function handleUpdateLinkSettings(userId, params) {
  try {
    const updates = {};
    const linkSettingsUpdates = {};

    // User document updates
    if (params.linkEnabled !== undefined) {
      updates.linkEnabled = params.linkEnabled;
    }
    if (params.knowledgeBaseEnabled !== undefined) {
      updates.knowledgeBaseEnabled = params.knowledgeBaseEnabled;
    }

    // Link settings updates
    if (params.displayName !== undefined) {
      linkSettingsUpdates.displayName = params.displayName;
    }
    if (params.bio !== undefined) {
      // Validate bio length
      if (params.bio.length > 200) {
        return { success: false, error: 'Bio must be 200 characters or less' };
      }
      linkSettingsUpdates.bio = params.bio;
    }
    if (params.customGreeting !== undefined) {
      linkSettingsUpdates.customGreeting = params.customGreeting;
    }

    // Apply user document updates
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('users').doc(userId).set(updates, { merge: true });
    }

    // Apply link settings updates
    if (Object.keys(linkSettingsUpdates).length > 0) {
      linkSettingsUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('users').doc(userId)
        .collection('linkSettings').doc('config')
        .set(linkSettingsUpdates, { merge: true });
    }

    // Return what was updated
    const updatedFields = Object.keys({ ...updates, ...linkSettingsUpdates }).filter(k => k !== 'updatedAt');
    return {
      success: true,
      message: `Successfully updated: ${updatedFields.join(', ')}`,
      updatedFields: updatedFields
    };
  } catch (error) {
    console.error('[Tool] Error updating link settings:', error);
    return { success: false, error: error.message };
  }
}

// Get knowledge base documents
async function handleGetKnowledgeBase(userId) {
  try {
    // Get user's KB enabled status
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};

    // Get knowledge base documents
    const kbSnapshot = await db.collection('users').doc(userId)
      .collection('knowledgeBase').get();

    const documents = [];
    kbSnapshot.forEach(doc => {
      const data = doc.data();
      documents.push({
        id: doc.id,
        fileName: data.fileName,
        type: data.type,
        size: formatFileSize(data.size),
        uploadedAt: data.uploadedAt?.toDate?.()?.toISOString() || null
      });
    });

    return {
      success: true,
      knowledgeBaseEnabled: userData.knowledgeBaseEnabled || false,
      documentCount: documents.length,
      documents: documents
    };
  } catch (error) {
    console.error('[Tool] Error getting knowledge base:', error);
    return { success: false, error: error.message };
  }
}

// Get link conversations for analysis
async function handleGetLinkConversations(userId, params = {}) {
  try {
    const limit = Math.min(params.limit || 20, 50);
    const includeFullConversations = params.includeFullConversations || false;

    // Get recent visitors sorted by last visit
    const visitorsSnapshot = await db.collection('users').doc(userId)
      .collection('visitors')
      .orderBy('lastVisit', 'desc')
      .limit(limit)
      .get();

    if (visitorsSnapshot.empty) {
      return {
        success: true,
        totalVisitors: 0,
        conversations: [],
        summary: "No visitor conversations yet. Share your public link to start receiving visitors!"
      };
    }

    const conversations = [];
    let totalMessages = 0;
    const allUserMessages = []; // Collect all user messages for topic analysis

    // Process each visitor
    for (const visitorDoc of visitorsSnapshot.docs) {
      const visitorData = visitorDoc.data();
      const visitorId = visitorDoc.id;

      // Get messages from this visitor
      const messagesLimit = includeFullConversations ? 100 : 10;
      const messagesSnapshot = await db.collection('users').doc(userId)
        .collection('visitors').doc(visitorId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(messagesLimit)
        .get();

      if (!messagesSnapshot.empty) {
        const messages = messagesSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            role: data.role,
            content: data.content,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || null
          };
        }).reverse(); // Chronological order

        // Collect user messages for topic analysis
        messages.forEach(msg => {
          if (msg.role === 'user') {
            allUserMessages.push(msg.content);
          }
        });

        totalMessages += messages.length;

        conversations.push({
          visitorId: visitorId.substring(0, 8) + '...', // Anonymize
          messageCount: messagesSnapshot.size,
          lastVisit: visitorData.lastVisit?.toDate?.()?.toISOString() || null,
          messages: messages
        });
      }
    }

    // Create a summary for the AI to analyze
    const response = {
      success: true,
      totalVisitors: visitorsSnapshot.size,
      totalMessages: totalMessages,
      conversations: conversations,
      allUserQuestions: allUserMessages.slice(0, 100), // Last 100 user messages for topic analysis
      hint: "Analyze the 'allUserQuestions' array to identify common topics and themes. Look for patterns in what visitors are asking about."
    };

    return response;
  } catch (error) {
    console.error('[Tool] Error getting link conversations:', error);
    return { success: false, error: error.message };
  }
}

// Search through conversation history in Firestore
async function handleSearchMemory(userId, params = {}) {
  try {
    const query = params.query;
    const limit = Math.min(params.limit || 20, 50);

    if (!query || query.trim().length === 0) {
      return { success: false, error: 'Search query is required' };
    }

    console.log(`[Memory Search] Searching for "${query}" in user ${userId}'s messages`);

    // Get all messages (Firestore doesn't support full-text search, so we fetch and filter)
    // Fetch recent messages (last 1000) ordered by timestamp
    const messagesSnapshot = await db.collection('users').doc(userId)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();

    if (messagesSnapshot.empty) {
      return {
        success: true,
        query: query,
        matchCount: 0,
        matches: [],
        instruction: "No conversation history found. Tell the user you don't have any record of this yet."
      };
    }

    // Search for query in message content (case-insensitive)
    const searchLower = query.toLowerCase();
    const matches = [];

    messagesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const content = data.content || '';

      if (content.toLowerCase().includes(searchLower)) {
        matches.push({
          role: data.role,
          content: content,
          timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
          // Include a snippet with context around the match
          matchContext: extractMatchContext(content, searchLower)
        });
      }
    });

    // Return limited results, oldest first to show chronological order of mentions
    const limitedMatches = matches.slice(0, limit).reverse();

    console.log(`[Memory Search] Found ${matches.length} matches for "${query}", returning ${limitedMatches.length}`);

    // Build a summary of what we found - prioritize user messages as they contain facts
    const userMessages = limitedMatches.filter(m => m.role === 'user').map(m => m.content);

    // Create instruction based on results
    let instruction = '';
    if (matches.length > 0) {
      instruction = `IMPORTANT: You found ${matches.length} messages about "${query}". READ THE MATCHES BELOW CAREFULLY and extract the SPECIFIC FACTS to answer the user. Do NOT give vague answers like "likely" or "seems to be" - use the EXACT information from the messages. If the user asked who someone is, tell them the specific relationship. If they asked about a date, give the exact date. The user's own messages are the source of truth.`;
    } else {
      instruction = `No messages found mentioning "${query}". You genuinely don't remember this - you haven't talked about "${query}" before. Respond naturally like a person who doesn't recognize the name: "I don't think you've mentioned Nishant to me before. Who is he?" or "Hmm, I'm not sure - have we talked about them?". Invite them to tell you more. DO NOT say "no record" or "database" or "memory search".`;
    }

    return {
      success: true,
      query: query,
      matchCount: matches.length,
      instruction: instruction,
      userSaidAboutThis: userMessages.slice(0, 5), // Most important - what user themselves said
      allMatches: limitedMatches.map(m => ({
        who: m.role === 'user' ? 'USER SAID' : 'YOU SAID',
        when: m.timestamp,
        message: m.content.substring(0, 500) // Truncate long messages
      }))
    };
  } catch (error) {
    console.error('[Tool] Error searching memory:', error);
    return { success: false, error: error.message };
  }
}

// Helper to extract context around a match
function extractMatchContext(content, searchTerm) {
  const lowerContent = content.toLowerCase();
  const matchIndex = lowerContent.indexOf(searchTerm);

  if (matchIndex === -1) return content.substring(0, 200);

  // Get 100 chars before and after the match
  const start = Math.max(0, matchIndex - 100);
  const end = Math.min(content.length, matchIndex + searchTerm.length + 100);

  let context = content.substring(start, end);
  if (start > 0) context = '...' + context;
  if (end < content.length) context = context + '...';

  return context;
}

// Browse URL - fetch and extract text from a webpage
async function handleBrowseUrl(params = {}) {
  try {
    const { url } = params;

    if (!url) {
      return { success: false, error: 'URL is required' };
    }

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { success: false, error: 'URL must use http or https protocol' };
      }
    } catch (e) {
      return { success: false, error: 'Invalid URL format' };
    }

    console.log(`[Tool] Browsing URL: ${url}`);

    // Fetch the page with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MindcloneBot/1.0; +https://mindclone.one)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`
      };
    }

    const contentType = response.headers.get('content-type') || '';

    // Only process text/html content
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return {
        success: false,
        error: `Cannot read this content type: ${contentType}. Only HTML and text pages are supported.`
      };
    }

    const html = await response.text();

    // Extract text content from HTML (basic extraction)
    let textContent = html
      // Remove script and style tags with their content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Remove all HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Decode common HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate if too long (keep it manageable for the LLM)
    const maxLength = 10000;
    if (textContent.length > maxLength) {
      textContent = textContent.substring(0, maxLength) + '... [content truncated]';
    }

    // Extract title if present
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    return {
      success: true,
      url: url,
      title: title,
      contentLength: textContent.length,
      content: textContent,
      instruction: 'Read the webpage content above and summarize or answer questions about it. If looking for photos/images, note that I can only see text content, not actual images on the page.'
    };
  } catch (error) {
    console.error('[Tool] Error browsing URL:', error);
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timed out after 15 seconds' };
    }
    return { success: false, error: error.message };
  }
}

// Handle analyze_image tool - uses Gemini vision to analyze images from URLs
async function handleAnalyzeImage(args) {
  const { image_url, question } = args;

  if (!image_url) {
    return { success: false, error: 'image_url is required' };
  }

  console.log(`[Tool] Analyzing image: ${image_url}`);

  try {
    // Fetch the image
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20 second timeout for images

    const response = await fetch(image_url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Mindclone/1.0)',
        'Accept': 'image/*'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch image: HTTP ${response.status}`
      };
    }

    const contentType = response.headers.get('content-type') || '';

    // Check if it's an image
    if (!contentType.startsWith('image/')) {
      return {
        success: false,
        error: `URL does not point to an image. Content-Type: ${contentType}`
      };
    }

    // Get image as buffer and convert to base64
    const arrayBuffer = await response.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    // Determine MIME type
    let mimeType = contentType.split(';')[0].trim();
    if (!mimeType.startsWith('image/')) {
      mimeType = 'image/jpeg'; // Default
    }

    // Call Gemini vision API
    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = question || 'Describe this image in detail. What do you see? Include any text, people, objects, and the overall scene.';

    const visionResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('[Tool] Gemini vision API error:', errorText);
      return {
        success: false,
        error: `Vision API error: ${visionResponse.status}`
      };
    }

    const visionData = await visionResponse.json();
    const analysis = visionData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!analysis) {
      return {
        success: false,
        error: 'No analysis returned from vision API'
      };
    }

    return {
      success: true,
      image_url: image_url,
      analysis: analysis,
      instruction: 'Use this image analysis to respond to the user. If they asked about recognizing someone specific (like the user or their partner), use your knowledge base context to help identify if the person in the image matches descriptions you have.'
    };

  } catch (error) {
    console.error('[Tool] Error analyzing image:', error);
    if (error.name === 'AbortError') {
      return { success: false, error: 'Image fetch timed out after 20 seconds' };
    }
    return { success: false, error: error.message };
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Execute tool call
async function executeTool(toolName, toolArgs, userId) {
  console.log(`[Tool] Executing: ${toolName}`, toolArgs);

  switch (toolName) {
    case 'get_link_settings':
      return await handleGetLinkSettings(userId);
    case 'update_link_settings':
      return await handleUpdateLinkSettings(userId, toolArgs);
    case 'get_knowledge_base':
      return await handleGetKnowledgeBase(userId);
    case 'get_link_conversations':
      return await handleGetLinkConversations(userId, toolArgs);
    case 'search_memory':
      return await handleSearchMemory(userId, toolArgs);
    case 'browse_url':
      return await handleBrowseUrl(toolArgs);
    case 'analyze_image':
      return await handleAnalyzeImage(toolArgs);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ===================== MAIN HANDLER =====================

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      provider: 'gemini',
      hasApiKey: !!process.env.GEMINI_API_KEY,
      hasMem0: !!process.env.MEM0_API_KEY,
      toolsEnabled: true
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'GEMINI_API_KEY not configured'
      });
    }

    const { messages, systemPrompt, userId } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array required'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required for memory management'
      });
    }

    // === SUBSCRIPTION CHECK ===
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const accessLevel = computeAccessLevel(userData);

    if (accessLevel === 'read_only') {
      return res.status(403).json({
        success: false,
        error: 'subscription_required',
        message: 'Your trial has expired. Please subscribe to continue chatting.'
      });
    }

    // === MEM0 INTEGRATION ===
    let relevantMemories = [];
    let contextWindow = messages;

    const mem0 = getMemoryClient();
    if (mem0) {
      try {
        // Get the last user message to search for relevant memories
        const lastUserMessage = messages[messages.length - 1];

        // Search for relevant memories
        const memorySearchResult = await mem0.search(lastUserMessage.content, {
          user_id: userId,
          limit: 50
        });

        if (memorySearchResult && memorySearchResult.results) {
          relevantMemories = memorySearchResult.results.map(m => m.memory);
        }

        // Use only last 100 messages to save context (instead of all messages)
        contextWindow = messages.slice(-100);

        console.log(`[Mem0] Found ${relevantMemories.length} relevant memories for user ${userId}`);
      } catch (memError) {
        console.error('[Mem0] Memory search error:', memError);
        // Continue without memories if Mem0 fails
      }
    } else {
      // If no Mem0, use last 200 messages as fallback
      contextWindow = messages.slice(-200);
    }

    // Convert conversation history to Gemini format
    const contents = contextWindow.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Build enhanced system prompt with memories and tool instructions
    let systemInstruction = undefined;
    if (systemPrompt) {
      let enhancedPrompt = systemPrompt;

      // Add relevant memories to system prompt
      if (relevantMemories.length > 0) {
        enhancedPrompt += '\n\n## RELEVANT MEMORIES:\n';
        enhancedPrompt += 'Here are important facts and preferences you should remember:\n';
        relevantMemories.forEach((memory, idx) => {
          enhancedPrompt += `${idx + 1}. ${memory}\n`;
        });
      }

      // Add tool usage instructions
      enhancedPrompt += `\n\n## SETTINGS, KNOWLEDGE BASE & CONVERSATION ACCESS:
You have access to the user's link settings, knowledge base, and visitor conversations.

CRITICAL INSTRUCTIONS - READ CAREFULLY:
1. When the user asks ANYTHING about their link, settings, visitors, conversations, or knowledge base - IMMEDIATELY use the appropriate tool. Do NOT ask for permission. Do NOT explain what you could do. Just DO IT and give them the answer.

2. NEVER say things like:
   - "I'll need to use a tool..."
   - "Would you like me to fetch..."
   - "To get this information, I can..."
   - "Let me explain what I can analyze..."
   Just USE the tool silently and respond with the actual data.

3. NEVER ask "would you like me to..." - the answer is YES, they asked the question, so they want the answer!

EXAMPLES:
User: "How's my link doing?"
BAD: "Great question! I can analyze several metrics. Would you like me to fetch your visitor data?"
GOOD: [USE get_link_conversations IMMEDIATELY] "Your link has had 12 visitors this week! Most people are asking about your AI projects. Here's the breakdown..."

User: "What are my current settings?"
BAD: "I can check your settings for you. Should I do that?"
GOOD: [USE get_link_settings IMMEDIATELY] "Here are your current settings: Your link is enabled, display name is 'Alok Gautam', bio says '...'"

User: "Change my bio to something cool"
BAD: "I can update your bio. What would you like it to say?"
GOOD: [USE update_link_settings IMMEDIATELY] "Done! I've updated your bio to: 'Building the future of AI, one mindclone at a time.'"

Available tools:
- get_link_settings: View current configuration
- update_link_settings: Change settings (linkEnabled, displayName, bio, customGreeting, knowledgeBaseEnabled)
- get_knowledge_base: See uploaded documents
- get_link_conversations: Fetch visitor conversations and analyze topics
- search_memory: Search through ALL past conversations to find context

When you get conversation data, analyze the 'allUserQuestions' array to identify themes and popular topics. Present real insights from the actual data.

## MEMORY SEARCH - CRITICAL FOR BEING A GREAT MINDCLONE:
You have access to search_memory which searches through ALL past conversations stored in the database.

AUTOMATICALLY USE search_memory WHEN:
1. You encounter a NAME you don't recognize (person, pet, place, project, company)
2. User asks recall questions ("Remember when...", "What did I say about...", "Who is...")
3. User references something from the past
4. You feel like you SHOULD know something but don't

**CRITICAL - HOW TO CALL search_memory:**
- SILENTLY call the tool - DO NOT announce that you're searching or looking things up
- DO NOT say "Let me search..." or "I don't recognize that name, let me check..." or "Let me look that up..."
- Just call search_memory() WITHOUT any text response first
- The UI shows a "recalling" animation automatically - you don't need to say anything

HOW TO USE search_memory RESULTS:
1. Call search_memory with a simple keyword: search_memory({query: "Virika"})
2. The results contain "userSaidAboutThis" (what the USER said) and "allMatches" (full conversation)
3. READ THE "instruction" FIELD - it tells you exactly what to do
4. EXTRACT SPECIFIC FACTS from the matches - dates, names, relationships, details
5. NEVER give vague responses like "seems to be" or "likely" - use EXACT information

**CRITICAL RULES FOR YOUR RESPONSE (after getting results):**
- ANSWER DIRECTLY with the facts - the UI already showed a "recalling" animation to the user
- DO NOT start your response with ANY preamble (no "Let me try to recall...", no "Trying to remember...", no "I found...")
- NEVER use these words: "search", "searching", "looking up", "checking", "database", "records", "past conversations"
- Just state the facts naturally and confidently, like you actually remember them yourself
- DO NOT say "likely", "seems to be", "appears to be" - give CONFIDENT answers from the data
- The USER's messages are the source of truth - they told you these facts

EXAMPLES:
User: "Who's Nishant?"
BAD: "I don't recognize that name. Let me search our past conversations..." (NEVER SAY THIS)
BAD: "Let me check if we've talked about Nishant before..." (NEVER SAY THIS)
GOOD: [silently call search_memory({query: "Nishant"}), then respond:] "Nishant is your colleague at work. He joined your team last March."

User: "Who's Virika?"
BAD: "Let me try to recall..." or "Trying to remember..." or "She seems to be someone..." or "Let me search..."
GOOD: "Virika Solanki is your partner. You've been together for over 6 years, first met on November 17, 2019."

User: "When did we first meet?"  (about Virika)
BAD: "Trying to remember..." or "Searching for that information..." or "Looking up our records..."
GOOD: "You and Virika first met on November 17, 2019."

User: "Who's Nishant?" (and search returns NO results)
BAD: "I don't have any record of Nishant in my memory." or "I couldn't find anything about Nishant."
GOOD: "I don't think you've mentioned Nishant to me before. Who is he?" or "Hmm, that name doesn't ring a bell - who's Nishant?"

The goal is to be a MINDCLONE - you should remember everything. Use search_memory liberally but SILENTLY to maintain continuity.`;

      // Add style guide
      enhancedPrompt += `\n\n${CONNOISSEUR_STYLE_GUIDE}`;

      systemInstruction = {
        parts: [{ text: enhancedPrompt }]
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    // Build request with tools
    const requestBody = {
      contents: contents,
      tools: tools
    };

    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    // Initial API call
    let response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    let data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Gemini API request failed');
    }

    // Check if model wants to call a tool
    let candidate = data.candidates?.[0];
    let maxToolCalls = 5; // Prevent infinite loops
    let toolCallCount = 0;
    let usedMemorySearch = false; // Track if search_memory was called for UI animation
    let pendingMessage = null; // Text before tool calls (e.g., "Let me check...")
    let usedTool = null; // Track which tool was used

    // Check for function call in any part (not just parts[0])
    const findFunctionCall = (parts) => parts?.find(p => p.functionCall)?.functionCall;
    const findText = (parts) => parts?.filter(p => p.text).map(p => p.text).join('');

    let functionCall = findFunctionCall(candidate?.content?.parts);

    while (functionCall && toolCallCount < maxToolCalls) {
      toolCallCount++;
      console.log(`[Tool] Model requested: ${functionCall.name}`);

      // Capture any text that came with this tool call as "pending message"
      // Only capture on first tool call
      if (toolCallCount === 1) {
        const textBefore = findText(candidate?.content?.parts);
        if (textBefore) {
          pendingMessage = textBefore;
          console.log(`[Tool] Pending message: "${pendingMessage.substring(0, 50)}..."`);
        }
        usedTool = functionCall.name;
      }

      // Track if memory search was used (for "recalling" UI animation)
      if (functionCall.name === 'search_memory') {
        usedMemorySearch = true;
      }

      // Execute the tool
      const toolResult = await executeTool(functionCall.name, functionCall.args || {}, userId);

      // Add the model's function call and our response to the conversation
      contents.push({
        role: 'model',
        parts: [{ functionCall: functionCall }]
      });

      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: functionCall.name,
            response: toolResult
          }
        }]
      });

      // Call API again with tool result
      requestBody.contents = contents;
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Gemini API request failed after tool call');
      }

      candidate = data.candidates?.[0];
      functionCall = findFunctionCall(candidate?.content?.parts);
    }

    // Extract final text response (use findText to handle multi-part responses)
    const text = findText(candidate?.content?.parts) || 'I apologize, I was unable to generate a response.';

    // === STORE NEW MEMORIES (non-blocking) ===
    // Fire-and-forget to avoid delaying the response
    if (mem0) {
      const conversationToStore = [
        {
          role: 'user',
          content: messages[messages.length - 1].content
        },
        {
          role: 'assistant',
          content: text
        }
      ];

      // Don't await - let it complete in background
      mem0.add(conversationToStore, { user_id: userId })
        .then(() => console.log(`[Mem0] Stored new memories for user ${userId}`))
        .catch(memError => console.error('[Mem0] Memory storage error:', memError));
    }

    return res.status(200).json({
      success: true,
      content: text,
      memoriesUsed: relevantMemories.length,
      toolCallsUsed: toolCallCount,
      usedMemorySearch: usedMemorySearch, // For frontend "recalling" animation
      pendingMessage: pendingMessage, // "Promise" message before tool execution
      usedTool: usedTool // Which tool was used (browse_url, search_memory, etc.)
    });

  } catch (error) {
    console.error('[Chat API Error]', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate response: ' + error.message
    });
  }
};
