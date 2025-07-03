/**
 * Enhanced Content Quality Scorer
 * 
 * This module provides sophisticated content quality assessment based on
 * defuddle's content scoring algorithms and additional heuristics for
 * documentation and technical content.
 */

/**
 * Content quality assessment with multiple scoring dimensions
 */
export class ContentQualityScorer {
  constructor(options = {}) {
    this.options = {
      // Scoring weights
      weights: {
        length: 0.2,
        structure: 0.25,
        readability: 0.2,
        technical: 0.2,
        noise: 0.15
      },
      
      // Thresholds
      minWordCount: 20,
      maxWordCount: 50000,
      minScore: 0.3,
      
      // Content type preferences
      preferTechnical: true,
      preferStructured: true,
      
      // Noise detection
      detectAds: true,
      detectNavigation: true,
      detectBoilerplate: true,
      
      ...options
    };
  }

  /**
   * Comprehensive content quality assessment
   */
  assessContentQuality(content, metadata = {}) {
    const scores = {
      length: this.scoreLength(content),
      structure: this.scoreStructure(content),
      readability: this.scoreReadability(content),
      technical: this.scoreTechnicalContent(content),
      noise: this.scoreNoiseReduction(content)
    };

    const overallScore = this.calculateOverallScore(scores);
    const qualityLevel = this.determineQualityLevel(overallScore);
    const recommendations = this.generateRecommendations(scores, overallScore);

    return {
      overallScore,
      qualityLevel,
      scores,
      recommendations,
      metadata: {
        wordCount: this.countWords(content),
        characterCount: content.length,
        assessmentTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Score content based on length
   */
  scoreLength(content) {
    const wordCount = this.countWords(content);
    const { minWordCount, maxWordCount } = this.options;

    if (wordCount < minWordCount) {
      return 0;
    }

    if (wordCount > maxWordCount) {
      return 0.5; // Penalize extremely long content
    }

    // Optimal length range: 100-2000 words
    if (wordCount >= 100 && wordCount <= 2000) {
      return 1.0;
    }

    // Good length range: 50-100 or 2000-5000 words
    if ((wordCount >= 50 && wordCount < 100) || (wordCount > 2000 && wordCount <= 5000)) {
      return 0.8;
    }

    // Acceptable length range: 20-50 or 5000-10000 words
    if ((wordCount >= 20 && wordCount < 50) || (wordCount > 5000 && wordCount <= 10000)) {
      return 0.6;
    }

    return 0.3;
  }

  /**
   * Score content based on structural elements
   */
  scoreStructure(content) {
    let score = 0;
    const elements = {
      headings: (content.match(/<h[1-6][^>]*>/gi) || []).length,
      paragraphs: (content.match(/<p[^>]*>/gi) || []).length,
      lists: (content.match(/<(ul|ol)[^>]*>/gi) || []).length,
      codeBlocks: (content.match(/<(pre|code)[^>]*>/gi) || []).length,
      links: (content.match(/<a[^>]*>/gi) || []).length,
      images: (content.match(/<img[^>]*>/gi) || []).length,
      tables: (content.match(/<table[^>]*>/gi) || []).length,
      blockquotes: (content.match(/<blockquote[^>]*>/gi) || []).length
    };

    const totalElements = Object.values(elements).reduce((sum, count) => sum + count, 0);
    
    if (totalElements === 0) {
      return 0.2; // Minimal score for plain text
    }

    // Score based on variety of structural elements
    const elementTypes = Object.values(elements).filter(count => count > 0).length;
    score += Math.min(0.4, elementTypes * 0.1);

    // Bonus for good heading structure
    if (elements.headings > 0) {
      const headingLevels = new Set();
      const headingMatches = content.match(/<h([1-6])[^>]*>/gi) || [];
      headingMatches.forEach(match => {
        const level = match.match(/<h([1-6])/i)[1];
        headingLevels.add(level);
      });
      score += Math.min(0.3, headingLevels.size * 0.1);
    }

    // Bonus for code blocks (technical content)
    if (elements.codeBlocks > 0) {
      score += 0.2;
    }

    // Bonus for links (referential content)
    if (elements.links > 0) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  /**
   * Score content based on readability
   */
  scoreReadability(content) {
    const text = this.stripHtml(content);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    if (sentences.length === 0 || words.length === 0) {
      return 0;
    }

    const avgSentenceLength = words.length / sentences.length;
    const avgWordLength = text.replace(/\s+/g, '').length / words.length;

    let score = 1.0;

    // Penalize very long sentences
    if (avgSentenceLength > 25) {
      score -= 0.3;
    } else if (avgSentenceLength > 20) {
      score -= 0.1;
    }

    // Penalize very long words
    if (avgWordLength > 8) {
      score -= 0.2;
    } else if (avgWordLength > 6) {
      score -= 0.1;
    }

    // Bonus for good sentence variety
    const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
    const lengthVariety = new Set(sentenceLengths).size / sentences.length;
    score += lengthVariety * 0.1;

    return Math.max(0, Math.min(1.0, score));
  }

  /**
   * Score content based on technical indicators
   */
  scoreTechnicalContent(content) {
    let score = 0;
    const text = this.stripHtml(content).toLowerCase();

    // Technical terminology indicators
    const technicalTerms = [
      'function', 'class', 'method', 'api', 'endpoint', 'database', 'server',
      'client', 'protocol', 'algorithm', 'framework', 'library', 'module',
      'interface', 'implementation', 'configuration', 'deployment', 'testing',
      'debugging', 'optimization', 'performance', 'security', 'authentication',
      'authorization', 'encryption', 'compression', 'serialization', 'parsing',
      'validation', 'error', 'exception', 'logging', 'monitoring', 'metrics'
    ];

    const foundTerms = technicalTerms.filter(term => text.includes(term));
    score += Math.min(0.4, foundTerms.length * 0.05);

    // Code-related indicators
    const codeIndicators = [
      'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
      'class', 'extends', 'import', 'export', 'async', 'await', 'promise',
      'try', 'catch', 'finally', 'throw', 'new', 'this', 'super'
    ];

    const foundCodeTerms = codeIndicators.filter(term => text.includes(term));
    score += Math.min(0.3, foundCodeTerms.length * 0.03);

    // File extension indicators
    const fileExtensions = /\.(js|ts|jsx|tsx|py|java|c|cpp|cs|php|rb|go|rs|swift|kt|scala|clj|hs|ml|sql|html|css|json|xml|yaml|yml|toml|ini|conf|sh|bash|ps1|bat)$/gi;
    const extensionMatches = (text.match(fileExtensions) || []).length;
    score += Math.min(0.2, extensionMatches * 0.1);

    // URL and protocol indicators
    const urlPatterns = /(https?:\/\/|ftp:\/\/|sftp:\/\/|ssh:\/\/|git:\/\/)/gi;
    const urlMatches = (text.match(urlPatterns) || []).length;
    score += Math.min(0.1, urlMatches * 0.05);

    return Math.min(1.0, score);
  }

  /**
   * Score content based on noise reduction
   */
  scoreNoiseReduction(content) {
    let score = 1.0;
    const text = this.stripHtml(content).toLowerCase();

    // Ad and promotional content detection
    if (this.options.detectAds) {
      const adIndicators = [
        'advertisement', 'sponsored', 'promoted', 'banner', 'advert',
        'click here', 'learn more', 'sign up', 'subscribe', 'newsletter',
        'limited time', 'special offer', 'discount', 'sale', 'free trial'
      ];

      const adMatches = adIndicators.filter(indicator => text.includes(indicator));
      score -= Math.min(0.4, adMatches.length * 0.1);
    }

    // Navigation and menu content detection
    if (this.options.detectNavigation) {
      const navIndicators = [
        'home', 'about', 'contact', 'privacy', 'terms', 'sitemap',
        'navigation', 'menu', 'breadcrumb', 'sidebar', 'footer'
      ];

      const navMatches = navIndicators.filter(indicator => text.includes(indicator));
      score -= Math.min(0.3, navMatches.length * 0.05);
    }

    // Boilerplate content detection
    if (this.options.detectBoilerplate) {
      const boilerplateIndicators = [
        'all rights reserved', 'copyright', 'powered by', 'made with',
        'designed by', 'developed by', 'created by', 'built with'
      ];

      const boilerplateMatches = boilerplateIndicators.filter(indicator => text.includes(indicator));
      score -= Math.min(0.2, boilerplateMatches.length * 0.05);
    }

    // Excessive punctuation and formatting
    const excessivePunctuation = (text.match(/[!]{2,}|[?]{2,}/g) || []).length;
    score -= Math.min(0.1, excessivePunctuation * 0.02);

    return Math.max(0, Math.min(1.0, score));
  }

  /**
   * Calculate overall score from individual scores
   */
  calculateOverallScore(scores) {
    const { weights } = this.options;
    
    return Object.keys(weights).reduce((total, key) => {
      return total + (scores[key] * weights[key]);
    }, 0);
  }

  /**
   * Determine quality level based on score
   */
  determineQualityLevel(score) {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'acceptable';
    if (score >= 0.2) return 'poor';
    return 'very-poor';
  }

  /**
   * Generate recommendations for content improvement
   */
  generateRecommendations(scores, overallScore) {
    const recommendations = [];

    if (scores.length < 0.5) {
      recommendations.push('Content is too short - consider adding more detail');
    }

    if (scores.structure < 0.4) {
      recommendations.push('Add structural elements like headings, lists, or code blocks');
    }

    if (scores.readability < 0.6) {
      recommendations.push('Improve readability by using shorter sentences and simpler words');
    }

    if (scores.technical < 0.3) {
      recommendations.push('Consider adding technical terminology and code examples');
    }

    if (scores.noise < 0.7) {
      recommendations.push('Remove promotional content and navigation elements');
    }

    return recommendations;
  }

  /**
   * Count words in content
   */
  countWords(content) {
    const text = this.stripHtml(content);
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Strip HTML tags from content
   */
  stripHtml(content) {
    return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Filter content based on quality threshold
   */
  filterByQuality(content, metadata = {}) {
    const assessment = this.assessContentQuality(content, metadata);
    
    return {
      passed: assessment.overallScore >= this.options.minScore,
      assessment,
      content: assessment.overallScore >= this.options.minScore ? content : null
    };
  }
}

/**
 * Factory function to create quality scorer with common configurations
 */
export function createQualityScorer(config = {}) {
  const defaultConfig = {
    // Documentation-focused scoring
    weights: {
      length: 0.15,
      structure: 0.3,
      readability: 0.25,
      technical: 0.25,
      noise: 0.05
    },
    minScore: 0.4,
    preferTechnical: true,
    preferStructured: true
  };

  return new ContentQualityScorer({ ...defaultConfig, ...config });
}

/**
 * Batch quality assessment for multiple content items
 */
export function batchAssessQuality(contentItems, scorer) {
  return contentItems.map(item => ({
    ...item,
    qualityAssessment: scorer.assessContentQuality(item.content, item.metadata)
  }));
} 