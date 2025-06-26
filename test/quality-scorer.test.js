import { expect, it, describe } from 'vitest';
import { 
  assessContentQuality, 
  filterHighQualityContent,
  calculateReadability,
  calculateCompleteness,
  calculateTechnicalRelevance,
  calculateStructureQuality
} from '../src/utils/quality-scorer.js';

describe('quality-scorer', () => {
  describe('calculateReadability', () => {
    it('should score content with good sentence structure highly', () => {
      const content = 'This is a well written sentence. It has good flow and structure. The vocabulary is diverse and engaging.';
      const score = calculateReadability(content);
      
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should penalize very short content', () => {
      const content = 'Short.';
      const score = calculateReadability(content);
      
      expect(score).toBe(0);
    });

    it('should penalize highly repetitive content', () => {
      const content = 'This is repeated. This is repeated. This is repeated. This is repeated.';
      const score = calculateReadability(content);
      
      expect(score).toBeLessThan(0.5);
    });

    it('should handle empty content', () => {
      expect(calculateReadability('')).toBe(0);
      expect(calculateReadability(null)).toBe(0);
    });
  });

  describe('calculateCompleteness', () => {
    it('should score complete content with multiple elements highly', () => {
      const content = `
# Main Title

This is a complete document with paragraphs.

## Subsection

- List item 1
- List item 2

\`\`\`javascript
const code = "example";
\`\`\`

More content here.
      `.trim();
      
      const score = calculateCompleteness(content);
      
      expect(score).toBeGreaterThan(0.7);
    });

    it('should penalize truncated content', () => {
      const content = 'This content looks like it was cut off...';
      const score = calculateCompleteness(content);
      
      expect(score).toBeLessThan(0.8);
    });

    it('should penalize content with "read more" indicators', () => {
      const content = 'Some content here. Read more to continue.';
      const score = calculateCompleteness(content);
      
      expect(score).toBeLessThan(0.8);
    });
  });

  describe('calculateTechnicalRelevance', () => {
    it('should score technical documentation highly', () => {
      const content = `
# API Documentation

This function accepts parameters and returns a string.

\`\`\`javascript
function example(parameter) {
  const variable = parameter;
  return variable;
}
\`\`\`

The API endpoint is https://api.example.com/v1/data.
      `.trim();
      
      const score = calculateTechnicalRelevance(content);
      
      expect(score).toBeGreaterThan(0.5);
    });

    it('should score non-technical content lower', () => {
      const content = 'This is a general article about cooking recipes and food preparation.';
      const score = calculateTechnicalRelevance(content);
      
      expect(score).toBeLessThan(0.3);
    });

    it('should handle programming language keywords', () => {
      const content = 'JavaScript is a programming language. Python and Java are also popular.';
      const score = calculateTechnicalRelevance(content);
      
      expect(score).toBeGreaterThan(0.2);
    });
  });

  describe('calculateStructureQuality', () => {
    it('should score well-structured content highly', () => {
      const content = `
# Main Title

## Section 1

Content with proper structure.

### Subsection

More content here.

\`\`\`
code block
\`\`\`
      `.trim();
      
      const score = calculateStructureQuality(content);
      
      expect(score).toBeGreaterThan(0.7);
    });

    it('should penalize content without structure', () => {
      const content = 'Just plain text without any structure or formatting.';
      const score = calculateStructureQuality(content);
      
      expect(score).toBeLessThan(0.5);
    });

    it('should detect malformed code blocks', () => {
      const content = 'Some text ``` incomplete code block';
      const score = calculateStructureQuality(content);
      
      expect(score).toBeLessThan(0.8);
    });
  });

  describe('assessContentQuality', () => {
    it('should provide comprehensive quality assessment', () => {
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
      
      const assessment = assessContentQuality(content);
      
      expect(assessment.overallScore).toBeGreaterThan(0.6);
      expect(assessment.qualityLevel).toMatch(/good|excellent/);
      expect(assessment.details).toHaveProperty('readability');
      expect(assessment.details).toHaveProperty('completeness');
      expect(assessment.details).toHaveProperty('technicalRelevance');
      expect(assessment.details).toHaveProperty('structure');
      expect(assessment.details).toHaveProperty('wordCount');
      expect(assessment.details).toHaveProperty('characterCount');
    });

    it('should reject content that is too short', () => {
      const content = 'Too short';
      const assessment = assessContentQuality(content, { minLength: 100 });
      
      expect(assessment.overallScore).toBe(0);
      expect(assessment.reason).toContain('too short');
    });

    it('should handle invalid input gracefully', () => {
      expect(assessContentQuality(null).overallScore).toBe(0);
      expect(assessContentQuality(123).overallScore).toBe(0);
      expect(assessContentQuality('').overallScore).toBe(0);
    });

    it('should apply technical content requirement', () => {
      const nonTechnicalContent = 'This is a general article about cooking and recipes.';
      const assessment = assessContentQuality(nonTechnicalContent, { 
        requireTechnical: true,
        minLength: 10
      });
      
      expect(assessment.overallScore).toBe(0);
      expect(assessment.reason).toContain('technical');
    });

    it('should use custom quality weights', () => {
      const content = 'A simple technical document about JavaScript programming.';
      const assessment = assessContentQuality(content, {
        weights: {
          readability: 0.1,
          completeness: 0.1,
          technicalRelevance: 0.7,
          structure: 0.1
        },
        minLength: 10
      });
      
      expect(assessment.details).toHaveProperty('readability');
      expect(assessment.details).toHaveProperty('technicalRelevance');
    });
  });

  describe('filterHighQualityContent', () => {
    const mockContentArray = [
      'This is excellent technical documentation about JavaScript programming with examples and clear structure.',
      'Short bad content.',
      `
# Comprehensive Guide

This is a detailed technical guide with proper structure.

## Code Examples

\`\`\`javascript
const example = "high quality";
\`\`\`

Complete with explanations and good formatting.
      `.trim(),
      'Another short piece.',
      {
        content: 'This is object-based content with good technical details about APIs and functions.',
        title: 'API Documentation'
      }
    ];

    it('should filter content by quality threshold', () => {
      const filtered = filterHighQualityContent(mockContentArray, 0.5);
      
      expect(filtered.length).toBeLessThan(mockContentArray.length);
      expect(filtered.length).toBeGreaterThan(0);
    });

    it('should add quality metadata to objects', () => {
      const filtered = filterHighQualityContent(mockContentArray, 0.3);
      const objectContent = filtered.find(item => typeof item === 'object' && item.title);
      
      if (objectContent) {
        expect(objectContent).toHaveProperty('qualityScore');
        expect(objectContent).toHaveProperty('qualityLevel');
        expect(objectContent).toHaveProperty('qualityDetails');
      }
    });

    it('should handle empty arrays', () => {
      const result = filterHighQualityContent([], 0.5);
      expect(result).toEqual([]);
    });

    it('should respect different quality thresholds', () => {
      const highThreshold = filterHighQualityContent(mockContentArray, 0.8);
      const lowThreshold = filterHighQualityContent(mockContentArray, 0.2);
      
      expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
    });
  });
}); 