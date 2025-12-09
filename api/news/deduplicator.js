// Deduplicator - Prevent sending duplicate articles
// Three-level strategy:
// 1. URL-based: Hash article URLs, check against Firestore
// 2. Content-based: Future enhancement with embeddings
// 3. Temporal window: Don't resend same topic within 24 hours

const crypto = require('crypto');
const { initializeFirebaseAdmin, admin } = require('../_firebase-admin');

// Initialize Firebase Admin SDK
initializeFirebaseAdmin();
const db = admin.firestore();

// Keep only last N articles to prevent bloat
const MAX_SEEN_ARTICLES = 100;

// Topic temporal window (24 hours)
const TOPIC_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Hash URL for deduplication tracking
 */
function hashUrl(url) {
  return crypto.createHash('sha256').update(url.trim().toLowerCase()).digest('hex').substring(0, 16);
}

/**
 * Check if user has seen this article before
 * Returns true if article URL was seen, false otherwise
 */
async function hasSeenArticle(userId, articleUrl) {
  try {
    const urlHash = hashUrl(articleUrl);

    // Get user's seen articles
    const configDoc = await db.collection('users').doc(userId)
      .collection('newsCuration').doc('config').get();

    if (!configDoc.exists) {
      return false;
    }

    const config = configDoc.data();
    const seenArticles = config.seenArticles || [];

    // Check if URL hash exists in seen articles
    const seen = seenArticles.some(article => article.urlHash === urlHash);

    if (seen) {
      console.log(`[Deduplicator] Article already seen by ${userId}: ${articleUrl.substring(0, 50)}...`);
    }

    return seen;

  } catch (error) {
    console.error(`[Deduplicator] Error checking seen article:`, error);
    // On error, assume not seen (fail open)
    return false;
  }
}

/**
 * Mark article as seen by user
 */
async function markArticleAsSeen(userId, article) {
  try {
    const urlHash = hashUrl(article.url);

    // Get current seen articles
    const configDoc = await db.collection('users').doc(userId)
      .collection('newsCuration').doc('config').get();

    let seenArticles = [];
    if (configDoc.exists) {
      seenArticles = configDoc.data().seenArticles || [];
    }

    // Add new article
    seenArticles.push({
      urlHash,
      title: article.title || 'Untitled',
      url: article.url,
      seenAt: new Date()
    });

    // Keep only last MAX_SEEN_ARTICLES to prevent bloat
    if (seenArticles.length > MAX_SEEN_ARTICLES) {
      seenArticles = seenArticles.slice(-MAX_SEEN_ARTICLES);
    }

    // Update Firestore
    await db.collection('users').doc(userId)
      .collection('newsCuration').doc('config')
      .set({
        seenArticles
      }, { merge: true });

    console.log(`[Deduplicator] Marked article as seen for ${userId}: ${article.title?.substring(0, 50) || 'Untitled'}...`);

  } catch (error) {
    console.error(`[Deduplicator] Error marking article as seen:`, error);
    // Non-fatal, continue
  }
}

/**
 * Check if topic was recently covered (within 24 hours)
 * Returns true if topic was sent recently, false otherwise
 */
async function hasRecentTopicCoverage(userId, topic) {
  try {
    const configDoc = await db.collection('users').doc(userId)
      .collection('newsCuration').doc('config').get();

    if (!configDoc.exists) {
      return false;
    }

    const config = configDoc.data();
    const recentTopics = config.recentTopics || [];

    const now = Date.now();
    const topicLower = topic.toLowerCase();

    // Check if topic was covered within temporal window
    for (const recentTopic of recentTopics) {
      if (recentTopic.topic.toLowerCase() === topicLower) {
        const timeSinceSent = now - recentTopic.lastSentAt.toMillis();
        if (timeSinceSent < TOPIC_WINDOW_MS) {
          console.log(`[Deduplicator] Topic "${topic}" was covered ${Math.round(timeSinceSent / 1000 / 60)} minutes ago for ${userId}`);
          return true;
        }
      }
    }

    return false;

  } catch (error) {
    console.error(`[Deduplicator] Error checking recent topic:`, error);
    return false;
  }
}

/**
 * Mark topic as recently covered
 */
async function markTopicAsCovered(userId, topic) {
  try {
    const configDoc = await db.collection('users').doc(userId)
      .collection('newsCuration').doc('config').get();

    let recentTopics = [];
    if (configDoc.exists) {
      recentTopics = configDoc.data().recentTopics || [];
    }

    const now = new Date();
    const topicLower = topic.toLowerCase();

    // Update or add topic
    let found = false;
    for (let i = 0; i < recentTopics.length; i++) {
      if (recentTopics[i].topic.toLowerCase() === topicLower) {
        recentTopics[i].lastSentAt = now;
        found = true;
        break;
      }
    }

    if (!found) {
      recentTopics.push({
        topic: topic,
        lastSentAt: now
      });
    }

    // Clean up old topics (outside temporal window)
    const cutoffTime = now.getTime() - TOPIC_WINDOW_MS;
    recentTopics = recentTopics.filter(t =>
      t.lastSentAt.toMillis ? t.lastSentAt.toMillis() > cutoffTime : t.lastSentAt.getTime() > cutoffTime
    );

    // Update Firestore
    await db.collection('users').doc(userId)
      .collection('newsCuration').doc('config')
      .set({
        recentTopics
      }, { merge: true });

    console.log(`[Deduplicator] Marked topic as covered for ${userId}: ${topic}`);

  } catch (error) {
    console.error(`[Deduplicator] Error marking topic as covered:`, error);
    // Non-fatal, continue
  }
}

/**
 * Batch mark multiple articles as seen (more efficient)
 */
async function markMultipleArticlesAsSeen(userId, articles) {
  try {
    if (!articles || articles.length === 0) {
      return;
    }

    // Get current seen articles
    const configDoc = await db.collection('users').doc(userId)
      .collection('newsCuration').doc('config').get();

    let seenArticles = [];
    if (configDoc.exists) {
      seenArticles = configDoc.data().seenArticles || [];
    }

    // Add new articles
    for (const article of articles) {
      const urlHash = hashUrl(article.url);
      seenArticles.push({
        urlHash,
        title: article.title || 'Untitled',
        url: article.url,
        seenAt: new Date()
      });
    }

    // Keep only last MAX_SEEN_ARTICLES
    if (seenArticles.length > MAX_SEEN_ARTICLES) {
      seenArticles = seenArticles.slice(-MAX_SEEN_ARTICLES);
    }

    // Update Firestore
    await db.collection('users').doc(userId)
      .collection('newsCuration').doc('config')
      .set({
        seenArticles
      }, { merge: true });

    console.log(`[Deduplicator] Marked ${articles.length} articles as seen for ${userId}`);

  } catch (error) {
    console.error(`[Deduplicator] Error marking multiple articles as seen:`, error);
    // Non-fatal, continue
  }
}

/**
 * Clean up old seen articles (maintenance function)
 */
async function cleanupOldSeenArticles(userId, maxAge = 30) {
  try {
    const configDoc = await db.collection('users').doc(userId)
      .collection('newsCuration').doc('config').get();

    if (!configDoc.exists) {
      return;
    }

    const config = configDoc.data();
    let seenArticles = config.seenArticles || [];

    // Remove articles older than maxAge days
    const cutoffTime = Date.now() - (maxAge * 24 * 60 * 60 * 1000);
    const originalCount = seenArticles.length;

    seenArticles = seenArticles.filter(article => {
      const seenTime = article.seenAt.toMillis ? article.seenAt.toMillis() : article.seenAt.getTime();
      return seenTime > cutoffTime;
    });

    if (seenArticles.length < originalCount) {
      // Update Firestore
      await db.collection('users').doc(userId)
        .collection('newsCuration').doc('config')
        .set({
          seenArticles
        }, { merge: true });

      console.log(`[Deduplicator] Cleaned up ${originalCount - seenArticles.length} old articles for ${userId}`);
    }

  } catch (error) {
    console.error(`[Deduplicator] Error cleaning up old articles:`, error);
    // Non-fatal, continue
  }
}

module.exports = {
  hashUrl,
  hasSeenArticle,
  markArticleAsSeen,
  hasRecentTopicCoverage,
  markTopicAsCovered,
  markMultipleArticlesAsSeen,
  cleanupOldSeenArticles
};
