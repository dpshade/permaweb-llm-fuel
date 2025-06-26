/**
 * Content Quality Scoring System
 * Assesses the quality of extracted content for LLM training and inference
 */

/**
 * Calculate readability score based on sentence structure and vocabulary
 * @param {string} content - Content to analyze
 * @returns {number} Readability score (0-1)
 */
function calculateReadability(content) {
  if (!content || content.length < 50) return 0;
  
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = content.split(/\s+/).filter(w => w.length > 0);
  
  if (sentences.length === 0 || words.length === 0) return 0;
  
  // Average sentence length (ideal: 15-20 words)
  const avgSentenceLength = words.length / sentences.length;
  const sentenceLengthScore = Math.max(0, 1 - Math.abs(avgSentenceLength - 17.5) / 17.5);
  
  // Vocabulary diversity (unique words / total words)
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const vocabularyScore = Math.min(1, uniqueWords.size / words.length * 2);
  
  // Penalize excessive repetition
  const repetitionPenalty = detectRepetition(content);
  
  return (sentenceLengthScore * 0.4 + vocabularyScore * 0.4 + (1 - repetitionPenalty) * 0.2);
}

/**
 * Detect content repetition patterns
 * @param {string} content - Content to analyze
 * @returns {number} Repetition penalty (0-1, where 1 is highly repetitive)
 */
function detectRepetition(content) {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length < 3) return 0;
  
  const sentenceHashes = sentences.map(s => s.trim().toLowerCase());
  const uniqueSentences = new Set(sentenceHashes);
  
  const repetitionRatio = 1 - (uniqueSentences.size / sentences.length);
  return Math.min(1, repetitionRatio * 2); // Scale the penalty
}

/**
 * Calculate content completeness score
 * @param {string} content - Content to analyze
 * @returns {number} Completeness score (0-1)
 */
function calculateCompleteness(content) {
  if (!content) return 0;
  
  const indicators = {
    // Positive indicators
    hasHeadings: /^#{1,6}\s+.+$/m.test(content),
    hasCodeBlocks: /```[\s\S]*?```/.test(content) || /^    \S.*$/m.test(content),
    hasLists: /^[\s]*[-*+]\s+.+$/m.test(content) || /^[\s]*\d+\.\s+.+$/m.test(content),
    hasParagraphs: content.split('\n\n').length > 2,
    sufficientLength: content.length >= 200,
    
    // Negative indicators (truncation signs)
    hasEllipsis: /\.{3,}|\u2026/.test(content),
    endsAbruptly: !/[.!?]$/.test(content.trim()),
    hasReadMore: /read\s+more|continue\s+reading|see\s+more/gi.test(content)
  };
  
  let score = 0;
  const positiveWeight = 0.2;
  const negativeWeight = 0.15;
  
  // Add positive indicators
  if (indicators.hasHeadings) score += positiveWeight;
  if (indicators.hasCodeBlocks) score += positiveWeight;
  if (indicators.hasLists) score += positiveWeight;
  if (indicators.hasParagraphs) score += positiveWeight;
  if (indicators.sufficientLength) score += positiveWeight;
  
  // Subtract negative indicators
  if (indicators.hasEllipsis) score -= negativeWeight;
  if (indicators.endsAbruptly) score -= negativeWeight;
  if (indicators.hasReadMore) score -= negativeWeight;
  
  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate technical content relevance score
 * @param {string} content - Content to analyze
 * @returns {number} Technical relevance score (0-1)
 */
function calculateTechnicalRelevance(content) {
  if (!content) return 0;
  
  const technicalIndicators = [
    // Programming and development
    /\b(function|class|method|variable|array|object|string|boolean|integer)\b/gi,
    /\b(javascript|python|java|html|css|sql|json|xml|api|sdk)\b/gi,
    /\b(database|server|client|frontend|backend|framework|library)\b/gi,
    
    // Documentation-specific terms
    /\b(documentation|docs|guide|tutorial|example|usage|syntax|parameter)\b/gi,
    /\b(install|setup|configure|deploy|build|test|debug)\b/gi,
    
    // Code patterns
    /[{}[\]();]/g,
    /\b[a-zA-Z_][a-zA-Z0-9_]*\(/g, // Function calls
    /\$[a-zA-Z_][a-zA-Z0-9_]*/g, // Variables
    /https?:\/\/[^\s]+/g // URLs
  ];
  
  let matchCount = 0;
  let totalMatches = 0;
  
  technicalIndicators.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      matchCount++;
      totalMatches += matches.length;
    }
  });
  
  // Score based on both variety and density of technical terms
  const varietyScore = matchCount / technicalIndicators.length;
  const densityScore = Math.min(1, totalMatches / (content.split(/\s+/).length / 100));
  
  return (varietyScore * 0.6 + densityScore * 0.4);
}

/**
 * Detect and score content structure quality
 * @param {string} content - Content to analyze
 * @returns {number} Structure quality score (0-1)
 */
function calculateStructureQuality(content) {
  if (!content) return 0;
  
  const structure = {
    hasTitle: /^#{1,2}\s+.+/m.test(content),
    hasSubheadings: /^#{3,6}\s+.+/m.test(content),
    hasHierarchy: (content.match(/^#{1,6}\s+/gm) || []).length >= 2,
    properSpacing: !/\n{4,}/.test(content), // No excessive spacing
    codeBlocksFormatted: !content.includes('```') || /```[\s\S]*?```/g.test(content),
    consistentFormatting: true // This could be expanded with more checks
  };
  
  const weights = {
    hasTitle: 0.25,
    hasSubheadings: 0.20,
    hasHierarchy: 0.20,
    properSpacing: 0.15,
    codeBlocksFormatted: 0.10,
    consistentFormatting: 0.10
  };
  
  let score = 0;
  Object.entries(structure).forEach(([key, value]) => {
    if (value && weights[key]) {
      score += weights[key];
    }
  });
  
  return score;
}

/**
 * Assess overall content quality for LLM training/inference
 * @param {string} content - Content to assess
 * @param {Object} options - Assessment options
 * @returns {Object} Quality assessment result
 */
export function assessContentQuality(content, options = {}) {
  const {
    minLength = 100,
    requireTechnical = false,
    weights = {
      readability: 0.25,
      completeness: 0.30,
      technicalRelevance: 0.25,
      structure: 0.20
    }
  } = options;
  
  if (!content || typeof content !== 'string') {
    return {
      overallScore: 0,
      reason: 'Invalid or empty content',
      details: {}
    };
  }
  
  if (content.length < minLength) {
    return {
      overallScore: 0,
      reason: `Content too short (${content.length} < ${minLength} characters)`,
      details: { length: content.length }
    };
  }
  
  // Calculate individual scores
  const scores = {
    readability: calculateReadability(content),
    completeness: calculateCompleteness(content),
    technicalRelevance: calculateTechnicalRelevance(content),
    structure: calculateStructureQuality(content)
  };
  
  // Calculate weighted overall score
  let overallScore = 0;
  Object.entries(weights).forEach(([metric, weight]) => {
    if (scores[metric] !== undefined) {
      overallScore += scores[metric] * weight;
    }
  });
  
  // Apply minimum thresholds
  if (requireTechnical && scores.technicalRelevance < 0.3) {
    return {
      overallScore: 0,
      reason: 'Insufficient technical content',
      details: scores
    };
  }
  
  // Determine quality classification
  let qualityLevel;
  let reason = 'Quality assessment complete';
  
  if (overallScore >= 0.8) {
    qualityLevel = 'excellent';
  } else if (overallScore >= 0.6) {
    qualityLevel = 'good';
  } else if (overallScore >= 0.4) {
    qualityLevel = 'fair';
    reason = 'Content quality is marginal, consider review';
  } else {
    qualityLevel = 'poor';
    reason = 'Content quality is below acceptable threshold';
  }
  
  return {
    overallScore,
    qualityLevel,
    reason,
    details: {
      ...scores,
      wordCount: content.split(/\s+/).filter(w => w.length > 0).length,
      characterCount: content.length,
      uniqueWords: new Set(content.toLowerCase().split(/\s+/)).size
    }
  };
}

/**
 * Filter content array by quality threshold
 * @param {Array} contentArray - Array of content objects with text
 * @param {number} minScore - Minimum quality score (0-1)
 * @param {Object} options - Assessment options
 * @returns {Array} Filtered high-quality content
 */
export function filterHighQualityContent(contentArray, minScore = 0.7, options = {}) {
  return contentArray.filter(item => {
    const content = typeof item === 'string' ? item : item.content || item.text || '';
    const quality = assessContentQuality(content, options);
    
    // Add quality metadata to the item if it's an object
    if (typeof item === 'object' && item !== null) {
      item.qualityScore = quality.overallScore;
      item.qualityLevel = quality.qualityLevel;
      item.qualityDetails = quality.details;
    }
    
    return quality.overallScore >= minScore;
  });
}

export {
  calculateReadability,
  calculateCompleteness,
  calculateTechnicalRelevance,
  calculateStructureQuality
}; 