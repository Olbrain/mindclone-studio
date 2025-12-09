// Relevance Scorer - Multi-factor algorithm to score article relevance
// Score range: 0-100
// - Topic Match: 0-40 pts
// - Recency: 0-20 pts
// - Source Authority: 0-20 pts
// - Novelty: 0-20 pts

// Trusted news sources (higher authority score)
const TRUSTED_SOURCES = [
  // Tech news
  'techcrunch.com', 'theverge.com', 'arstechnica.com', 'wired.com', 'engadget.com',
  'venturebeat.com', 'technologyreview.com', 'zdnet.com', 'cnet.com',
  // Business/finance
  'bloomberg.com', 'reuters.com', 'ft.com', 'wsj.com', 'fortune.com',
  'forbes.com', 'cnbc.com', 'businessinsider.com',
  // General news
  'nytimes.com', 'theguardian.com', 'bbc.com', 'npr.org', 'apnews.com',
  'washingtonpost.com', 'economist.com',
  // Research/academic
  'arxiv.org', 'nature.com', 'science.org', 'acm.org', 'ieee.org',
  'sciencedirect.com', 'springer.com',
  // Industry-specific
  'techradar.com', 'gizmodo.com', 'mashable.com', 'slashdot.org',
  'hackernews.com', 'ycombinator.com', 'medium.com'
];

// Semi-trusted sources (medium authority)
const SEMI_TRUSTED_SOURCES = [
  'reddit.com', 'twitter.com', 'x.com', 'linkedin.com',
  'substack.com', 'dev.to', 'producthunt.com'
];

/**
 * Calculate relevance score for an article given user profile
 * Returns score 0-100
 */
function calculateRelevanceScore(article, userProfile) {
  let score = 0;

  // Factor 1: Topic Match (0-40 points)
  score += calculateTopicMatchScore(article, userProfile);

  // Factor 2: Recency (0-20 points)
  score += calculateRecencyScore(article);

  // Factor 3: Source Authority (0-20 points)
  score += calculateSourceAuthorityScore(article);

  // Factor 4: Novelty (0-20 points)
  score += calculateNoveltyScore(article);

  // Ensure score is within 0-100
  score = Math.max(0, Math.min(100, Math.round(score)));

  return score;
}

/**
 * Calculate topic match score (0-40 points)
 * Checks how well article matches user's topics, entities, industries, curiosities
 */
function calculateTopicMatchScore(article, userProfile) {
  let score = 0;

  // Combine all text fields for matching
  const articleText = [
    article.title || '',
    article.snippet || '',
    article.query || ''
  ].join(' ').toLowerCase();

  // Check topic matches (up to 25 points)
  const topics = userProfile.topics || [];
  let topicMatches = 0;
  for (const topic of topics) {
    if (articleText.includes(topic.toLowerCase())) {
      topicMatches++;
    }
  }
  // Scale to 0-25 points
  score += Math.min(25, topicMatches * 5);

  // Check entity matches (up to 10 points)
  const entities = userProfile.entities || [];
  let entityMatches = 0;
  for (const entity of entities) {
    if (articleText.includes(entity.toLowerCase())) {
      entityMatches++;
    }
  }
  // Scale to 0-10 points
  score += Math.min(10, entityMatches * 3);

  // Check industry matches (up to 3 points)
  const industries = userProfile.industries || [];
  let industryMatches = 0;
  for (const industry of industries) {
    if (articleText.includes(industry.toLowerCase())) {
      industryMatches++;
    }
  }
  // Scale to 0-3 points
  score += Math.min(3, industryMatches * 1);

  // Check curiosity matches (up to 2 points)
  const curiosities = userProfile.curiosities || [];
  let curiosityMatches = 0;
  for (const curiosity of curiosities) {
    // Check for partial matches (at least 3 words from curiosity)
    const curiosityWords = curiosity.toLowerCase().split(' ').filter(w => w.length > 3);
    const matchedWords = curiosityWords.filter(word => articleText.includes(word));
    if (matchedWords.length >= Math.min(3, curiosityWords.length)) {
      curiosityMatches++;
    }
  }
  // Scale to 0-2 points
  score += Math.min(2, curiosityMatches * 2);

  return score;
}

/**
 * Calculate recency score (0-20 points)
 * Newer articles score higher with exponential decay
 */
function calculateRecencyScore(article) {
  // If no published date, assume recent (give moderate score)
  if (!article.publishedDate) {
    return 12; // Default moderate score for undated articles
  }

  try {
    const publishedTime = new Date(article.publishedDate).getTime();
    const now = Date.now();
    const ageHours = (now - publishedTime) / (1000 * 60 * 60);

    // Scoring:
    // < 6 hours: 20 points
    // 6-24 hours: 18 points
    // 1-3 days: 15 points
    // 3-7 days: 10 points
    // 7-14 days: 5 points
    // > 14 days: 2 points

    if (ageHours < 6) return 20;
    if (ageHours < 24) return 18;
    if (ageHours < 72) return 15;
    if (ageHours < 168) return 10;
    if (ageHours < 336) return 5;
    return 2;

  } catch (error) {
    // Invalid date format
    return 12;
  }
}

/**
 * Calculate source authority score (0-20 points)
 * Trusted sources get higher scores
 */
function calculateSourceAuthorityScore(article) {
  const source = (article.source || '').toLowerCase();
  const url = (article.url || '').toLowerCase();

  // Check if source is in trusted list
  for (const trustedSource of TRUSTED_SOURCES) {
    if (source.includes(trustedSource) || url.includes(trustedSource)) {
      return 20; // Trusted source
    }
  }

  // Check if source is in semi-trusted list
  for (const semiTrustedSource of SEMI_TRUSTED_SOURCES) {
    if (source.includes(semiTrustedSource) || url.includes(semiTrustedSource)) {
      return 12; // Semi-trusted source
    }
  }

  // Check for common indicators of quality
  const qualityIndicators = [
    '.edu', '.gov', '.org', // Educational, government, non-profit
    'research', 'journal', 'paper', // Academic
    'official', 'blog' // Official sources
  ];

  for (const indicator of qualityIndicators) {
    if (url.includes(indicator) || source.includes(indicator)) {
      return 10; // Moderate authority
    }
  }

  // Unknown source
  return 5; // Minimal authority for unknown sources
}

/**
 * Calculate novelty score (0-20 points)
 * Rewards unique/fresh content
 * Note: This is a placeholder - actual implementation would check against seen articles
 */
function calculateNoveltyScore(article) {
  // For now, give a base novelty score
  // In practice, this would be calculated based on:
  // - Whether URL was seen before
  // - Whether topic was covered recently
  // - Content similarity to previous articles

  // Give moderate novelty score by default
  // The deduplicator will filter out truly non-novel articles
  return 15;
}

/**
 * Get priority level based on score
 * Returns: 'high' (≥60), 'medium' (40-59), 'low' (<40)
 */
function getPriorityLevel(score) {
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Check if article should be sent based on score threshold
 */
function shouldSendArticle(score, minThreshold = 60) {
  return score >= minThreshold;
}

module.exports = {
  calculateRelevanceScore,
  calculateTopicMatchScore,
  calculateRecencyScore,
  calculateSourceAuthorityScore,
  calculateNoveltyScore,
  getPriorityLevel,
  shouldSendArticle
};
