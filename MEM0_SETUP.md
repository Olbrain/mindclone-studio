# Mem0 Integration Setup

This project uses **Mem0** for intelligent memory management, which allows unlimited conversation length by:
- Storing important facts and preferences
- Retrieving only relevant context for each conversation
- Automatically summarizing long conversations

## Setup Instructions

### 1. Get Your Mem0 API Key

1. Go to [https://mem0.ai/](https://mem0.ai/)
2. Sign up for a free account
3. Navigate to the API Keys section
4. Create a new API key

### 2. Add to Vercel Environment Variables

1. Go to your Vercel dashboard
2. Select your `mindclone-studio` project
3. Go to **Settings** → **Environment Variables**
4. Add a new variable:
   - **Name**: `MEM0_API_KEY`
   - **Value**: Your Mem0 API key from step 1
   - **Environment**: Production, Preview, Development (select all)
5. Click **Save**
6. Redeploy your project for the changes to take effect

### 3. How It Works

Once configured, Mem0 will:

- **Store Memories**: After each conversation, important facts are extracted and stored
- **Retrieve Context**: When you chat, relevant memories are searched and included
- **Limit Context Window**: Only the last 20 messages are sent to Gemini (instead of all)
- **Add Relevant Memories**: Top 10 relevant memories are added to the system prompt

This means:
- ✅ Unlimited conversation length (no context window limits)
- ✅ Better personalization (AI remembers important facts)
- ✅ Lower costs (fewer tokens sent to Gemini)
- ✅ Smarter responses (relevant past context without overwhelming the AI)

### 4. Verify It's Working

After deployment, you can check if Mem0 is working:

1. Go to `/api/chat` (GET request)
2. You should see `"hasMem0": true` in the response

In the browser console, you'll see logs like:
```
[Mem0] Found 5 relevant memories for user abc123
[Mem0] Stored new memories for user abc123
```

### 5. Fallback Behavior

If Mem0 is not configured (no API key):
- The system will still work
- It will use the last 50 messages as a fallback
- No memories will be stored or retrieved

## Mem0 Free Tier

- Free tier includes sufficient requests for personal use
- Check their pricing page for current limits
- Upgrade if needed for higher usage

## Support

If you have issues, check the Mem0 documentation: https://docs.mem0.ai/
