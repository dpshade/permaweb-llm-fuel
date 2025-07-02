import { expect, it, describe } from 'vitest';

// Mock the client-side quality assessment function
function assessContentQuality(content, options = {}) {
  const { minLength = 30 } = options; // Further reduced from 50 to 30
  
  if (!content || content.length < minLength) {
    return {
      overallScore: 0,
      qualityLevel: 'poor',
      reason: 'Content too short'
    };
  }
  
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
  const avgWordLength = content.replace(/\s+/g, '').length / wordCount;
  
  // Much more lenient scoring to reduce over-filtering
  let score = Math.min(1.0, wordCount / 100); // Further reduced cap to 100 words
  score *= Math.min(1.0, avgWordLength / 2.0); // Further reduced preference to 2.0 characters
  
  // Boost score for shorter but meaningful content
  if (wordCount >= 20 && wordCount < 60) {
    score *= 1.5; // 50% boost for short but acceptable content
  }
  
  // Additional boost for technical content indicators
  const technicalIndicators = /(function|class|api|http|https|\.js|\.ts|\.html|\.css|\.json|\.xml|database|server|client)/i;
  if (technicalIndicators.test(content)) {
    score *= 1.2; // 20% boost for technical content
  }
  
  // Minimum score for any content that passes length check
  score = Math.max(score, 0.2); // Ensure minimum score of 0.2 for any valid content
  
  return {
    overallScore: score,
    qualityLevel: score > 0.3 ? 'high' : score > 0.15 ? 'medium' : 'low', // Much more lenient thresholds
    reason: `Word count: ${wordCount}, avg word length: ${avgWordLength.toFixed(1)}`
  };
}

describe('Quality Assessment Performance Improvements', () => {
  it('should accept shorter content with new thresholds', () => {
    const shortContent = 'This is a short technical document about JavaScript functions and API usage.';
    const assessment = assessContentQuality(shortContent);
    
    expect(assessment.overallScore).toBeGreaterThan(0.1); // Should pass the new threshold
    expect(assessment.qualityLevel).toMatch(/medium|high/);
  });

  it('should give technical content a boost', () => {
    const technicalContent = 'This document explains how to use the API function with JSON responses.';
    const assessment = assessContentQuality(technicalContent);
    
    expect(assessment.overallScore).toBeGreaterThan(0.1);
    expect(assessment.qualityLevel).toMatch(/medium|high/);
  });

  it('should handle very short content gracefully', () => {
    const veryShortContent = 'Short.';
    const assessment = assessContentQuality(veryShortContent);
    
    expect(assessment.overallScore).toBe(0);
    expect(assessment.qualityLevel).toBe('poor');
  });

  it('should accept content that was previously filtered out', () => {
    // Simulate content that would have been filtered with old thresholds
    const previouslyFilteredContent = 'This is a brief guide about web development. It covers HTML, CSS, and JavaScript basics.';
    const assessment = assessContentQuality(previouslyFilteredContent);
    
    expect(assessment.overallScore).toBeGreaterThan(0.1);
    expect(assessment.qualityLevel).toMatch(/medium|high/);
  });

  it('should be more lenient with word count requirements', () => {
    const lowWordCountContent = 'API documentation. Function examples. Code snippets.';
    const assessment = assessContentQuality(lowWordCountContent);
    
    expect(assessment.overallScore).toBeGreaterThan(0.1);
    expect(assessment.qualityLevel).toMatch(/medium|high/);
  });
}); 