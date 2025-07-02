import { expect, it, describe, beforeEach } from 'vitest';
import {
  JSDetector,
  QualityMetrics,
  ContentSanitizer,
  QualityThresholds,
  PageValidator,
  BatchValidator,
  validateContent,
  validateAndSanitizeContent,
  validateBatch,
  enhancedContentValidation
} from '../src/utils/content-validator.js';

describe('content-validator', () => {
  describe('JSDetector', () => {
    let detector;

    beforeEach(() => {
      detector = new JSDetector();
    });

    it('should detect script tags', () => {
      const content = '<script>alert("test");</script>Some content';
      const result = detector.detect(content);
      
      expect(result.hasJS).toBe(true);
      expect(result.count).toBeGreaterThan(0);
      expect(result.matches.scriptTags).toHaveLength(1);
    });

    it('should detect inline event handlers', () => {
      const content = '<button onclick="alert(\'test\')">Click me</button>';
      const result = detector.detect(content);
      
      expect(result.hasJS).toBe(true);
      expect(result.matches.inlineHandlers).toHaveLength(1);
    });

    it('should detect javascript URLs', () => {
      const content = '<a href="javascript:alert(\'test\')">Link</a>';
      const result = detector.detect(content);
      
      expect(result.hasJS).toBe(true);
      expect(result.matches.jsUrls).toHaveLength(1);
    });

    it('should detect eval calls', () => {
      const content = 'eval("alert(\'test\')");';
      const result = detector.detect(content);
      
      expect(result.hasJS).toBe(true);
      expect(result.matches.evalCalls).toHaveLength(1);
    });

    it('should not detect valid content', () => {
      const content = 'This is valid content without any JavaScript.';
      const result = detector.detect(content);
      
      expect(result.hasJS).toBe(false);
      expect(result.count).toBe(0);
    });

    it('should provide detailed analysis', () => {
      const content = '<script>alert("test");</script><button onclick="test()">Click</button>';
      const analysis = detector.analyzeJS(content);
      
      expect(analysis.hasJS).toBe(true);
      expect(analysis.severity).toBe('low');
      expect(analysis.recommendations).toContain('Remove script tags completely');
      expect(analysis.recommendations).toContain('Remove inline event handlers');
    });
  });

  describe('QualityMetrics', () => {
    let metrics;

    beforeEach(() => {
      metrics = new QualityMetrics();
    });

    it('should calculate basic metrics', () => {
      const content = 'This is a test sentence. It has multiple words and structure.';
      const result = metrics.calculateMetrics(content);
      
      expect(result.length).toBeGreaterThan(0);
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.sentenceCount).toBe(2);
      expect(result.avgWordsPerSentence).toBeGreaterThan(0);
      expect(result.lexicalDiversity).toBeGreaterThan(0);
      expect(result.readabilityScore).toBeGreaterThan(0);
    });

    it('should handle empty content', () => {
      const result = metrics.calculateMetrics('');
      const empty = metrics.getEmptyMetrics();
      
      expect(result).toEqual(empty);
    });

    it('should count code blocks', () => {
      const content = `
# Title

Some text here.

\`\`\`javascript
const test = "example";
\`\`\`

More text.

    const indented = "code";
    const block = "example";
      `;
      
      const result = metrics.calculateMetrics(content);
      
      expect(result.codeBlockCount).toBeGreaterThan(0);
    });

    it('should count headings', () => {
      const content = `
# Main Title

## Section 1

### Subsection

## Section 2
      `;
      
      const result = metrics.calculateMetrics(content);
      
      expect(result.headingCount).toBe(4);
    });

    it('should calculate readability score', () => {
      const shortContent = 'Short.';
      const longContent = 'This is a very long sentence that goes on and on with many words to test readability scoring and see how it handles complex sentence structures.';
      
      const shortScore = metrics.calculateReadability(['Short'], ['Short']);
      const longScore = metrics.calculateReadability(
        longContent.split(/\s+/),
        [longContent]
      );
      
      expect(shortScore).toBeLessThan(0.1);
      expect(longScore).toBeLessThan(1);
    });
  });

  describe('ContentSanitizer', () => {
    let sanitizer;
    let detector;

    beforeEach(() => {
      detector = new JSDetector();
      sanitizer = new ContentSanitizer(detector);
    });

    it('should remove JavaScript content', () => {
      const content = '<script>alert("test");</script>Valid content here.';
      const result = sanitizer.sanitize(content);
      
      expect(result).toBe('Valid content here.');
      expect(result).not.toContain('<script>');
    });

    it('should remove inline handlers', () => {
      const content = '<button onclick="test()">Click me</button>Valid content.';
      const result = sanitizer.sanitize(content);
      
      expect(result).toBe('Valid content.');
      expect(result).not.toContain('onclick');
    });

    it('should preserve valid content', () => {
      const content = 'This is valid content with <strong>formatting</strong>.';
      const result = sanitizer.sanitize(content);
      
      expect(result).toContain('This is valid content');
      expect(result).toContain('formatting');
    });

    it('should provide sanitization report', () => {
      const content = '<script>alert("test");</script>Valid content.';
      const report = sanitizer.sanitizeWithReport(content);
      
      expect(report.originalContent).toBe(content);
      expect(report.sanitizedContent).toBe('Valid content.');
      expect(report.jsAnalysis.hasJS).toBe(true);
      expect(report.contentReduction).toBeGreaterThan(0);
      expect(report.sanitizationApplied).toBe(true);
    });
  });

  describe('QualityThresholds', () => {
    let thresholds;

    beforeEach(() => {
      thresholds = new QualityThresholds();
    });

    it('should evaluate content against thresholds', () => {
      const metrics = {
        length: 200,
        wordCount: 30,
        sentenceCount: 3,
        lexicalDiversity: 0.8,
        readabilityScore: 0.7,
        paragraphCount: 2,
        codeBlockCount: 1,
        headingCount: 1
      };
      
      const jsDetection = { hasJS: false, count: 0, matches: {} };
      const result = thresholds.evaluate(metrics, jsDetection, 200);
      
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThan(0.7);
    });

    it('should fail content with JavaScript', () => {
      const metrics = {
        length: 200,
        wordCount: 30,
        sentenceCount: 3,
        lexicalDiversity: 0.8,
        readabilityScore: 0.7,
        paragraphCount: 2,
        codeBlockCount: 1,
        headingCount: 1
      };
      
      const jsDetection = { 
        hasJS: true, 
        count: 1, 
        matches: { scriptTags: ['<script>test</script>'] } 
      };
      
      const result = thresholds.evaluate(metrics, jsDetection, 200);
      
      expect(result.checks.jsRatio).toBe(false);
    });

    it('should allow custom thresholds', () => {
      thresholds.setThresholds({ minLength: 500, minWordCount: 50 });
      
      const metrics = {
        length: 300,
        wordCount: 30,
        sentenceCount: 3,
        lexicalDiversity: 0.8,
        readabilityScore: 0.7,
        paragraphCount: 2,
        codeBlockCount: 1,
        headingCount: 1
      };
      
      const jsDetection = { hasJS: false, count: 0, matches: {} };
      const result = thresholds.evaluate(metrics, jsDetection, 300);
      
      expect(result.checks.length).toBe(false);
      expect(result.checks.wordCount).toBe(false);
    });
  });

  describe('PageValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new PageValidator();
    });

    it('should validate good content', () => {
      const page = {
        url: 'https://example.com',
        content: 'This is a well-written article with good structure and multiple sentences. It contains useful information and provides valuable insights. The content is comprehensive and well-organized with proper formatting and structure.'
      };
      
      const result = validator.validate(page);
      
      expect(result.valid).toBe(true);
      expect(result.url).toBe('https://example.com');
      // The content should be valid, but might have minor issues
      expect(result.valid).toBe(true);
    });

    it('should reject content with JavaScript', () => {
      const page = {
        url: 'https://example.com',
        content: '<script>alert("test");</script>Some content here.'
      };
      
      const result = validator.validate(page);
      
      expect(result.valid).toBe(false);
      expect(result.jsDetection.hasJS).toBe(true);
      expect(result.issues.some(i => i.type === 'raw_js')).toBe(true);
    });

    it('should identify quality issues', () => {
      const page = {
        url: 'https://example.com',
        content: 'Short.'
      };
      
      const result = validator.validate(page);
      
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should handle missing content', () => {
      const page = { url: 'https://example.com' };
      
      const result = validator.validate(page);
      
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === 'missing_content')).toBe(true);
    });

    it('should validate and sanitize content', () => {
      const page = {
        url: 'https://example.com',
        content: '<script>alert("test");</script>Valid content here with good structure and multiple sentences. This content is comprehensive and well-organized with proper formatting and structure.'
      };
      
      const result = validator.validateAndSanitize(page);
      
      expect(result.sanitizationApplied).toBe(true);
      expect(result.sanitizedContent).toBe('Valid content here with good structure and multiple sentences. This content is comprehensive and well-organized with proper formatting and structure.');
      expect(result.valid).toBe(true);
    });
  });

  describe('BatchValidator', () => {
    let batchValidator;

    beforeEach(() => {
      batchValidator = new BatchValidator();
    });

    it('should process batch of pages', async () => {
      const pages = [
        { url: 'https://example1.com', content: 'Good content with multiple sentences and structure. This content is comprehensive and well-organized with proper formatting and structure.' },
        { url: 'https://example2.com', content: '<script>alert("test");</script>Valid content with multiple sentences and good structure.' },
        { url: 'https://example3.com', content: 'Short.' }
      ];
      
      const result = await batchValidator.processBatch(pages);
      
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.report.total).toBe(3);
      expect(result.report.valid).toBeGreaterThan(0);
    });

    it('should track statistics correctly', async () => {
      const pages = [
        { url: 'https://example1.com', content: 'Good content with multiple sentences and structure. This content is comprehensive and well-organized.' },
        { url: 'https://example2.com', content: '<script>test</script>Good content with multiple sentences and structure.' }
      ];
      
      await batchValidator.processBatch(pages);
      const report = batchValidator.getReport();
      
      expect(report.total).toBe(2);
      expect(report.successRate).toBeGreaterThan(0);
      expect(report.sanitizationRate).toBeGreaterThan(0);
    });

    it('should handle progress callbacks', async () => {
      const pages = [
        { url: 'https://example1.com', content: 'Good content with multiple sentences and structure. This content is comprehensive and well-organized.' },
        { url: 'https://example2.com', content: 'More good content with multiple sentences and structure. This content is comprehensive and well-organized.' }
      ];
      
      const progressCalls = [];
      
      await batchValidator.processBatch(pages, {
        onProgress: (completed, total, url, result) => {
          progressCalls.push({ completed, total, url });
        }
      });
      
      expect(progressCalls.length).toBe(2);
      expect(progressCalls[0].completed).toBe(1);
      expect(progressCalls[1].completed).toBe(2);
    });
  });

  describe('Convenience Functions', () => {
    it('should validate content directly', () => {
      const content = 'This is valid content with good structure and multiple sentences. This content is comprehensive and well-organized with proper formatting and structure.';
      const result = validateContent(content);
      
      expect(result.valid).toBe(true);
      expect(result.metrics.wordCount).toBeGreaterThan(0);
    });

    it('should validate and sanitize content', () => {
      const content = '<script>alert("test");</script>Valid content here with multiple sentences and good structure. This content is comprehensive and well-organized.';
      const result = validateAndSanitizeContent(content);
      
      expect(result.sanitizationApplied).toBe(true);
      expect(result.valid).toBe(true);
      expect(result.sanitizedContent).toBe('Valid content here with multiple sentences and good structure. This content is comprehensive and well-organized.');
    });

    it('should process batch with convenience function', async () => {
      const pages = [
        { url: 'https://example1.com', content: 'Good content with multiple sentences and structure. This content is comprehensive and well-organized.' },
        { url: 'https://example2.com', content: 'More good content with multiple sentences and structure. This content is comprehensive and well-organized.' }
      ];
      
      const result = await validateBatch(pages);
      
      expect(result.results.length).toBe(2);
      expect(result.report.total).toBe(2);
    });
  });

  describe('Enhanced Content Validation', () => {
    it('should combine systematic checks with quality assessment', () => {
      const content = `
# Technical Documentation

This is a well-structured technical document about JavaScript development.

## Overview

JavaScript is a versatile programming language. Here's an example:

\`\`\`javascript
function greet(name) {
  const message = \`Hello, \${name}!\`;
  return message;
}
\`\`\`

## Usage

Call the function with a parameter to get a greeting message.

- Easy to use
- Well documented
- Production ready

The API endpoint is available at https://api.example.com.
      `.trim();
      
      const result = enhancedContentValidation(content);
      
      // Debug: log the validation details
      console.log('Enhanced validation result:', {
        valid: result.valid,
        enhancedScore: result.enhancedScore,
        finalDecision: result.finalDecision,
        qualityAssessment: result.qualityAssessment,
        evaluation: result.evaluation
      });
      
      expect(result.valid).toBe(true);
      expect(result.enhancedScore).toBeGreaterThan(0.6);
      expect(result.qualityAssessment.overallScore).toBeGreaterThan(0.6);
      expect(result.finalDecision).toBe(true);
      expect(result.jsDetection.hasJS).toBe(false);
    });

    it('should reject content with JavaScript', () => {
      const content = '<script>alert("test");</script>Some content here.';
      const result = enhancedContentValidation(content);
      
      expect(result.jsDetection.hasJS).toBe(true);
      expect(result.finalDecision).toBe(false);
    });

    it('should handle low quality content', () => {
      const content = 'Short.';
      const result = enhancedContentValidation(content, { qualityThreshold: 0.8 });
      
      expect(result.finalDecision).toBe(false);
      expect(result.enhancedScore).toBeLessThan(0.8);
    });
  });

  describe('Integration with Existing Quality Scorer', () => {
    it('should maintain compatibility with existing quality assessment', () => {
      const content = 'This is a well-written technical document with good structure and multiple sentences. This content is comprehensive and well-organized with proper formatting and structure.';
      const result = enhancedContentValidation(content);
      
      expect(result.qualityAssessment).toBeDefined();
      expect(result.qualityAssessment.overallScore).toBeGreaterThan(0);
      expect(result.qualityAssessment.qualityLevel).toBeDefined();
      expect(result.qualityAssessment.details).toBeDefined();
    });
  });
}); 