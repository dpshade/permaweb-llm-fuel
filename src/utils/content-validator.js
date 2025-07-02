/**
 * Content Validation System
 * Systematic detection and validation of content quality issues
 * Integrates with existing quality-scorer and content-enhancer modules
 */

import { assessContentQuality } from './quality-scorer.js';
import { enhancedDefuddleExtraction } from './content-enhancer.js';

/**
 * JavaScript Detection Component
 * Detects unescaped JavaScript that shouldn't be in processed text
 */
class JSDetector {
  constructor() {
    this.patterns = {
      scriptTags: /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      inlineHandlers: /\bon\w+\s*=\s*["'][^"']*["']/gi,
      jsUrls: /javascript:\s*[^"'\s]+/gi,
      evalCalls: /\beval\s*\(/gi,
      functionCalls: /\b(function|var|let|const)\s+\w+\s*\(/gi,
      consoleCalls: /\bconsole\.(log|warn|error|info)\s*\(/gi,
      alertCalls: /\balert\s*\(/gi,
      documentWrite: /\bdocument\.write\s*\(/gi,
      innerHTML: /\.innerHTML\s*=/gi
    };
  }

  /**
   * Detect JavaScript patterns in content
   * @param {string} content - Content to analyze
   * @returns {Object} Detection results with matches and counts
   */
  detect(content) {
    if (!content || typeof content !== 'string') {
      return { matches: {}, count: 0, hasJS: false };
    }

    const matches = {};
    let totalMatches = 0;
    
    for (const [type, pattern] of Object.entries(this.patterns)) {
      matches[type] = content.match(pattern) || [];
      totalMatches += matches[type].length;
    }
    
    return { 
      matches, 
      count: totalMatches, 
      hasJS: totalMatches > 0,
      jsRatio: content.length > 0 ? totalMatches / content.length : 0
    };
  }

  /**
   * Get detailed analysis of detected JavaScript
   * @param {string} content - Content to analyze
   * @returns {Object} Detailed JS analysis
   */
  analyzeJS(content) {
    const detection = this.detect(content);
    
    if (!detection.hasJS) {
      return { ...detection, severity: 'none', recommendations: [] };
    }

    const severity = detection.count > 10 ? 'high' : 
                    detection.count > 5 ? 'medium' : 'low';
    
    const recommendations = [];
    
    if (detection.matches.scriptTags.length > 0) {
      recommendations.push('Remove script tags completely');
    }
    if (detection.matches.inlineHandlers.length > 0) {
      recommendations.push('Remove inline event handlers');
    }
    if (detection.matches.evalCalls.length > 0) {
      recommendations.push('Remove eval() calls - security risk');
    }
    if (detection.matches.consoleCalls.length > 0) {
      recommendations.push('Remove console logging statements');
    }

    return {
      ...detection,
      severity,
      recommendations
    };
  }
}

/**
 * Content Quality Metrics Component
 * Provides objective measures of content quality
 */
class QualityMetrics {
  /**
   * Calculate comprehensive quality metrics
   * @param {string} content - Content to analyze
   * @returns {Object} Quality metrics
   */
  calculateMetrics(content) {
    if (!content || typeof content !== 'string') {
      return this.getEmptyMetrics();
    }

    const text = this.stripHTML(content);
    const words = text.match(/\b\w+\b/g) || [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
    
    return {
      length: text.length,
      wordCount: words.length,
      sentenceCount: sentences.length,
      avgWordsPerSentence: words.length / Math.max(sentences.length, 1),
      lexicalDiversity: new Set(words.map(w => w.toLowerCase())).size / Math.max(words.length, 1),
      readabilityScore: this.calculateReadability(words, sentences),
      paragraphCount: this.countParagraphs(content),
      codeBlockCount: this.countCodeBlocks(content),
      headingCount: this.countHeadings(content),
      linkCount: this.countLinks(content)
    };
  }

  /**
   * Strip HTML tags for text analysis
   * @param {string} content - Content with HTML
   * @returns {string} Clean text
   */
  stripHTML(content) {
    return content
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate readability score
   * @param {Array} words - Array of words
   * @param {Array} sentences - Array of sentences
   * @returns {number} Readability score (0-1)
   */
  calculateReadability(words, sentences) {
    if (sentences.length === 0) return 0;
    
    const avgSentenceLength = words.length / sentences.length;
    const idealLength = 15;
    const maxAcceptable = 30;
    
    // Score based on how close to ideal sentence length
    const lengthScore = Math.max(0, 1 - Math.abs(avgSentenceLength - idealLength) / idealLength);
    
    // Penalize very long sentences
    const longSentencePenalty = avgSentenceLength > maxAcceptable ? 
      (avgSentenceLength - maxAcceptable) / maxAcceptable : 0;
    
    return Math.max(0, lengthScore - longSentencePenalty);
  }

  /**
   * Count paragraphs in content
   * @param {string} content - Content to analyze
   * @returns {number} Paragraph count
   */
  countParagraphs(content) {
    return content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
  }

  /**
   * Count code blocks in content
   * @param {string} content - Content to analyze
   * @returns {number} Code block count
   */
  countCodeBlocks(content) {
    const fencedBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
    const indentedBlocks = (content.match(/^    \S.*$/gm) || []).length;
    return fencedBlocks + Math.ceil(indentedBlocks / 3); // Group consecutive indented lines
  }

  /**
   * Count headings in content
   * @param {string} content - Content to analyze
   * @returns {number} Heading count
   */
  countHeadings(content) {
    return (content.match(/^#{1,6}\s+.+$/gm) || []).length;
  }

  /**
   * Count links in content
   * @param {string} content - Content to analyze
   * @returns {number} Link count
   */
  countLinks(content) {
    return (content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).length;
  }

  /**
   * Get empty metrics object
   * @returns {Object} Empty metrics
   */
  getEmptyMetrics() {
    return {
      length: 0,
      wordCount: 0,
      sentenceCount: 0,
      avgWordsPerSentence: 0,
      lexicalDiversity: 0,
      readabilityScore: 0,
      paragraphCount: 0,
      codeBlockCount: 0,
      headingCount: 0,
      linkCount: 0
    };
  }
}

/**
 * Content Sanitization Component
 * Remove problematic content while preserving valid text
 */
class ContentSanitizer {
  constructor(jsDetector) {
    this.jsDetector = jsDetector;
  }

  /**
   * Sanitize content by removing problematic elements
   * @param {string} content - Content to sanitize
   * @returns {string} Sanitized content
   */
  sanitize(content) {
    if (!content || typeof content !== 'string') {
      return '';
    }

    let cleaned = content;
    
    // Remove JS patterns
    for (const pattern of Object.values(this.jsDetector.patterns)) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    // Remove common problematic patterns
    cleaned = cleaned
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed\b[^>]*>/gi, '')
      .replace(/<applet\b[^>]*>[\s\S]*?<\/applet>/gi, '')
      .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, '')
      .replace(/<input\b[^>]*>/gi, '')
      .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, '')
      .replace(/<select\b[^>]*>[\s\S]*?<\/select>/gi, '');
    
    // Normalize whitespace
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();
    
    return cleaned;
  }

  /**
   * Sanitize with detailed reporting
   * @param {string} content - Content to sanitize
   * @returns {Object} Sanitization result with details
   */
  sanitizeWithReport(content) {
    const originalLength = content.length;
    const jsAnalysis = this.jsDetector.analyzeJS(content);
    const sanitized = this.sanitize(content);
    const finalLength = sanitized.length;
    
    return {
      originalContent: content,
      sanitizedContent: sanitized,
      jsAnalysis,
      contentReduction: originalLength - finalLength,
      reductionPercentage: originalLength > 0 ? 
        ((originalLength - finalLength) / originalLength) * 100 : 0,
      sanitizationApplied: jsAnalysis.hasJS
    };
  }
}

/**
 * Quality Threshold Component
 * Define what constitutes acceptable content quality
 */
class QualityThresholds {
  constructor() {
    this.thresholds = {
      minLength: 100,
      minWordCount: 20,
      minSentences: 2,
      minLexicalDiversity: 0.3,
      minReadability: 0.4,
      maxJSRatio: 0.05,
      minParagraphs: 1,
      minCodeBlocks: 0,
      minHeadings: 0
    };
  }

  /**
   * Evaluate content against quality thresholds
   * @param {Object} metrics - Quality metrics
   * @param {Object} jsDetection - JS detection results
   * @param {number} originalLength - Original content length
   * @returns {Object} Evaluation results
   */
  evaluate(metrics, jsDetection, originalLength) {
    const jsRatio = jsDetection.count > 0 ? 
      jsDetection.matches.scriptTags.join('').length / originalLength : 0;
    
    const checks = {
      length: metrics.length >= this.thresholds.minLength,
      wordCount: metrics.wordCount >= this.thresholds.minWordCount,
      sentences: metrics.sentenceCount >= this.thresholds.minSentences,
      diversity: metrics.lexicalDiversity >= this.thresholds.minLexicalDiversity,
      readability: metrics.readabilityScore >= this.thresholds.minReadability,
      jsRatio: jsRatio <= this.thresholds.maxJSRatio,
      paragraphs: metrics.paragraphCount >= this.thresholds.minParagraphs,
      codeBlocks: metrics.codeBlockCount >= this.thresholds.minCodeBlocks,
      headings: metrics.headingCount >= this.thresholds.minHeadings
    };
    
    const passed = Object.values(checks).filter(Boolean).length;
    const total = Object.keys(checks).length;
    
    return {
      checks,
      score: passed / total,
      passed: passed >= total * 0.7, // 70% of checks must pass
      passedCount: passed,
      totalChecks: total
    };
  }

  /**
   * Set custom thresholds
   * @param {Object} newThresholds - New threshold values
   */
  setThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }
}

/**
 * Page Validation Component
 * Combine all checks into a single validation result
 */
class PageValidator {
  constructor(options = {}) {
    this.jsDetector = new JSDetector();
    this.qualityMetrics = new QualityMetrics();
    this.sanitizer = new ContentSanitizer(this.jsDetector);
    this.thresholds = new QualityThresholds();
    
    if (options.thresholds) {
      this.thresholds.setThresholds(options.thresholds);
    }
  }

  /**
   * Validate a single page
   * @param {Object} page - Page object with url and content
   * @returns {Object} Validation results
   */
  validate(page) {
    if (!page || !page.content) {
      return {
        url: page?.url || 'unknown',
        valid: false,
        issues: [{ type: 'missing_content', severity: 'high' }],
        metrics: this.qualityMetrics.getEmptyMetrics(),
        canSanitize: false,
        reason: 'No content provided'
      };
    }

    const jsDetection = this.jsDetector.detect(page.content);
    const metrics = this.qualityMetrics.calculateMetrics(page.content);
    const evaluation = this.thresholds.evaluate(metrics, jsDetection, page.content.length);
    
    const issues = this.identifyIssues(evaluation.checks, jsDetection);
    
    return {
      url: page.url,
      valid: evaluation.passed && !jsDetection.hasJS,
      issues,
      metrics,
      jsDetection,
      evaluation,
      canSanitize: jsDetection.hasJS && evaluation.score > 0.5,
      reason: this.generateReason(evaluation, jsDetection, issues)
    };
  }

  /**
   * Identify specific issues from validation
   * @param {Object} checks - Quality check results
   * @param {Object} jsDetection - JS detection results
   * @returns {Array} Array of identified issues
   */
  identifyIssues(checks, jsDetection) {
    const issues = [];
    
    if (jsDetection.hasJS) {
      issues.push({ 
        type: 'raw_js', 
        severity: 'high', 
        count: jsDetection.count,
        details: jsDetection.matches
      });
    }
    
    for (const [check, passed] of Object.entries(checks)) {
      if (!passed) {
        issues.push({ 
          type: check, 
          severity: 'medium',
          threshold: this.thresholds.thresholds[check]
        });
      }
    }
    
    return issues;
  }

  /**
   * Generate human-readable reason for validation result
   * @param {Object} evaluation - Evaluation results
   * @param {Object} jsDetection - JS detection results
   * @param {Array} issues - Identified issues
   * @returns {string} Human-readable reason
   */
  generateReason(evaluation, jsDetection, issues) {
    if (jsDetection.hasJS) {
      return `Content contains ${jsDetection.count} JavaScript elements`;
    }
    
    if (evaluation.passed) {
      return 'Content meets quality standards';
    }
    
    const failedChecks = issues.filter(i => i.type !== 'raw_js').map(i => i.type);
    return `Failed quality checks: ${failedChecks.join(', ')}`;
  }

  /**
   * Validate and optionally sanitize content
   * @param {Object} page - Page object
   * @returns {Object} Validation and sanitization results
   */
  validateAndSanitize(page) {
    const validation = this.validate(page);
    
    if (validation.valid) {
      return {
        ...validation,
        sanitizedContent: page.content,
        sanitizationApplied: false
      };
    }
    
    if (validation.canSanitize) {
      const sanitization = this.sanitizer.sanitizeWithReport(page.content);
      const revalidation = this.validate({ ...page, content: sanitization.sanitizedContent });
      
      return {
        ...revalidation,
        originalValidation: validation,
        sanitizedContent: sanitization.sanitizedContent,
        sanitizationApplied: true,
        sanitizationReport: sanitization
      };
    }
    
    return {
      ...validation,
      sanitizedContent: null,
      sanitizationApplied: false
    };
  }
}

/**
 * Batch Processing Integration Component
 * Process multiple pages efficiently with reporting
 */
class BatchValidator {
  constructor(options = {}) {
    this.validator = new PageValidator(options);
    this.stats = {
      total: 0,
      valid: 0,
      sanitized: 0,
      rejected: 0,
      issues: new Map(),
      processingTime: 0
    };
  }

  /**
   * Process a batch of pages
   * @param {Array} pages - Array of page objects
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Batch processing results
   */
  async processBatch(pages, options = {}) {
    const {
      sanitize = true,
      detailedReporting = true,
      onProgress = () => {}
    } = options;

    const startTime = Date.now();
    const results = [];
    
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      
      try {
        const result = sanitize ? 
          this.validator.validateAndSanitize(page) :
          this.validator.validate(page);
        
        this.updateStats(result);
        
        if (result.valid) {
          results.push({ ...page, ...result, status: 'valid' });
        } else if (result.sanitizationApplied && result.valid) {
          results.push({ 
            ...page, 
            content: result.sanitizedContent,
            ...result, 
            status: 'sanitized' 
          });
        } else {
          this.logRejection(page.url, result.issues);
          if (detailedReporting) {
            results.push({ ...page, ...result, status: 'rejected' });
          }
        }
        
        onProgress(i + 1, pages.length, page.url, result);
        
      } catch (error) {
        console.error(`Error processing ${page.url}:`, error);
        this.stats.rejected++;
        onProgress(i + 1, pages.length, page.url, { error: error.message });
      }
    }
    
    this.stats.processingTime = Date.now() - startTime;
    
    return {
      results,
      report: this.getReport()
    };
  }

  /**
   * Update processing statistics
   * @param {Object} validation - Validation result
   */
  updateStats(validation) {
    this.stats.total++;
    
    if (validation.valid) {
      this.stats.valid++;
    }
    
    if (validation.sanitizationApplied) {
      this.stats.sanitized++;
    }
    
    validation.issues.forEach(issue => {
      const count = this.stats.issues.get(issue.type) || 0;
      this.stats.issues.set(issue.type, count + 1);
    });
  }

  /**
   * Log rejected content
   * @param {string} url - Page URL
   * @param {Array} issues - Validation issues
   */
  logRejection(url, issues) {
    this.stats.rejected++;
    console.warn(`Rejected ${url}:`, issues.map(i => i.type));
  }

  /**
   * Get processing report
   * @returns {Object} Processing statistics and summary
   */
  getReport() {
    return {
      ...this.stats,
      successRate: this.stats.total > 0 ? this.stats.valid / this.stats.total : 0,
      sanitizationRate: this.stats.total > 0 ? this.stats.sanitized / this.stats.total : 0,
      rejectionRate: this.stats.total > 0 ? this.stats.rejected / this.stats.total : 0,
      issueBreakdown: Object.fromEntries(this.stats.issues),
      averageProcessingTime: this.stats.total > 0 ? 
        this.stats.processingTime / this.stats.total : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      total: 0,
      valid: 0,
      sanitized: 0,
      rejected: 0,
      issues: new Map(),
      processingTime: 0
    };
  }
}

// Export main components
export {
  JSDetector,
  QualityMetrics,
  ContentSanitizer,
  QualityThresholds,
  PageValidator,
  BatchValidator
};

// Export convenience functions
export function validateContent(content, options = {}) {
  const validator = new PageValidator(options);
  return validator.validate({ content, url: 'unknown' });
}

export function validateAndSanitizeContent(content, options = {}) {
  const validator = new PageValidator(options);
  const result = validator.validateAndSanitize({ content, url: 'unknown' });
  
  // Return the sanitized content if available
  return {
    ...result,
    sanitizedContent: result.sanitizedContent || content
  };
}

export async function validateBatch(pages, options = {}) {
  const batchValidator = new BatchValidator(options);
  return batchValidator.processBatch(pages, options);
}

/**
 * Integration with existing quality-scorer
 * Enhanced validation that combines systematic checks with existing quality assessment
 */
export function enhancedContentValidation(content, options = {}) {
  const validator = new PageValidator(options);
  const validation = validator.validate({ content, url: 'unknown' });
  
  // Integrate with existing quality-scorer
  const qualityAssessment = assessContentQuality(content, {
    minLength: options.minLength || 100,
    requireTechnical: options.requireTechnical || false
  });
  
  return {
    ...validation,
    qualityAssessment,
    enhancedScore: (validation.evaluation.score + qualityAssessment.overallScore) / 2,
    finalDecision: validation.valid && qualityAssessment.overallScore >= (options.qualityThreshold || 0.7)
  };
} 