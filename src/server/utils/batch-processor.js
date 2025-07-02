/**
 * Batch Processing System with Concurrency Control
 * Provides parallel processing with quality control and retry mechanisms
 */

import { assessContentQuality } from './quality-scorer.js';

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.current < this.max) {
        this.current++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      this.current++;
      resolve();
    }
  }
}

/**
 * Retry wrapper with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Result of successful execution
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    retryCondition = () => true
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries || !retryCondition(error)) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        baseDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );
      
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Extract content with retry logic and quality assessment
 * @param {string} url - URL to extract content from
 * @param {Function} extractFn - Content extraction function
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} Extracted content with quality metadata
 */
async function extractWithRetry(url, extractFn, options = {}) {
  const {
    qualityThreshold = 0.7,
    maxRetries = 3,
    timeout = 30000
  } = options;

  const extraction = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const result = await extractFn(url, { 
        signal: controller.signal,
        ...options 
      });
      
      clearTimeout(timeoutId);
      
      if (!result || !result.content) {
        throw new Error('No content extracted');
      }
      
      // Assess content quality
      const qualityAssessment = assessContentQuality(result.content, {
        minLength: options.minLength || 100,
        requireTechnical: options.requireTechnical || false
      });
      
      // Add quality metadata to result
      result.qualityScore = qualityAssessment.overallScore;
      result.qualityLevel = qualityAssessment.qualityLevel;
      result.qualityDetails = qualityAssessment.details;
      result.qualityReason = qualityAssessment.reason;
      
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  const retryCondition = (error) => {
    // Don't retry on certain errors
    const nonRetryableErrors = [
      'abort', // User aborted
      '404', // Not found
      '403', // Forbidden
      'invalid content', // Content validation failed
    ];
    
    return !nonRetryableErrors.some(pattern => 
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  };

  return withRetry(extraction, {
    maxRetries,
    retryCondition,
    baseDelay: 1000
  });
}

/**
 * Optimized batch extraction with parallel processing and quality control
 * @param {string[]} urls - URLs to process
 * @param {Function} extractFn - Content extraction function
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Array of successful extractions
 */
export async function optimizedBatchExtraction(urls, extractFn, options = {}) {
  const {
    concurrency = 5,
    qualityThreshold = 0.7,
    onProgress = () => {},
    onError = () => {},
    onQualityFilter = () => {},
    includeFailures = false,
    maxRetries = 3,
    timeout = 30000
  } = options;

  const semaphore = new Semaphore(concurrency);
  const results = [];
  const failures = [];
  let completed = 0;

  // Process URLs in parallel with controlled concurrency
  const promises = urls.map(async (url, index) => {
    await semaphore.acquire();
    
    try {
      const result = await extractWithRetry(url, extractFn, {
        ...options,
        maxRetries,
        timeout
      });
      
      // Check quality threshold
      if (result.qualityScore >= qualityThreshold) {
        results.push(result);
      } else {
        onQualityFilter(url, result.qualityScore, result.qualityReason);
        if (includeFailures) {
          failures.push({
            url,
            error: `Quality score ${result.qualityScore.toFixed(2)} below threshold ${qualityThreshold}`,
            qualityScore: result.qualityScore,
            qualityReason: result.qualityReason
          });
        }
      }
      
      completed++;
      onProgress(completed, urls.length, url, result.qualityScore);
      
    } catch (error) {
      console.error(`Failed to process ${url}:`, error.message);
      onError(url, error);
      
      if (includeFailures) {
        failures.push({
          url,
          error: error.message,
          qualityScore: 0
        });
      }
      
      completed++;
      onProgress(completed, urls.length, url, 0);
      
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(promises);

  // Sort results by quality score (highest first)
  results.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

  const summary = {
    total: urls.length,
    successful: results.length,
    failed: failures.length,
    averageQuality: results.length > 0 
      ? results.reduce((sum, r) => sum + (r.qualityScore || 0), 0) / results.length 
      : 0
  };

  return {
    results,
    failures: includeFailures ? failures : [],
    summary
  };
}

/**
 * Batch processing with streaming results (memory efficient)
 * @param {string[]} urls - URLs to process
 * @param {Function} extractFn - Content extraction function
 * @param {Function} onResult - Callback for each result
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing summary
 */
export async function streamingBatchExtraction(urls, extractFn, onResult, options = {}) {
  const {
    concurrency = 5,
    qualityThreshold = 0.7,
    chunkSize = 100
  } = options;

  let totalProcessed = 0;
  let successfulCount = 0;
  let qualitySum = 0;

  // Process URLs in chunks to manage memory
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    
    const chunkResult = await optimizedBatchExtraction(chunk, extractFn, {
      ...options,
      concurrency,
      qualityThreshold,
      onProgress: (completed, total, url, quality) => {
        const globalCompleted = totalProcessed + completed;
        const globalTotal = urls.length;
        options.onProgress?.(globalCompleted, globalTotal, url, quality);
      }
    });

    // Stream results immediately
    for (const result of chunkResult.results) {
      await onResult(result);
      successfulCount++;
      qualitySum += result.qualityScore || 0;
    }

    totalProcessed += chunk.length;
    
    // Small delay between chunks to prevent overwhelming the system
    if (i + chunkSize < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return {
    totalProcessed,
    successfulCount,
    averageQuality: successfulCount > 0 ? qualitySum / successfulCount : 0
  };
}

/**
 * Smart batch processor that adapts concurrency based on performance
 * @param {string[]} urls - URLs to process
 * @param {Function} extractFn - Content extraction function
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results with adaptive metrics
 */
export async function adaptiveBatchExtraction(urls, extractFn, options = {}) {
  const {
    initialConcurrency = 3,
    maxConcurrency = 10,
    minConcurrency = 1,
    adaptationInterval = 20, // Adjust after every N requests
    targetLatency = 2000 // Target 2s per request
  } = options;

  let currentConcurrency = initialConcurrency;
  let processedCount = 0;
  let totalLatency = 0;
  let lastAdaptationTime = Date.now();
  
  const results = [];
  const chunkSize = adaptationInterval;

  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const startTime = Date.now();
    
    const chunkResult = await optimizedBatchExtraction(chunk, extractFn, {
      ...options,
      concurrency: currentConcurrency
    });

    const endTime = Date.now();
    const chunkLatency = (endTime - startTime) / chunk.length;
    
    results.push(...chunkResult.results);
    processedCount += chunk.length;
    totalLatency += (endTime - startTime);

    // Adapt concurrency based on performance
    if (processedCount >= adaptationInterval) {
      const avgLatency = totalLatency / processedCount;
      
      if (avgLatency > targetLatency && currentConcurrency > minConcurrency) {
        // Too slow, reduce concurrency
        currentConcurrency = Math.max(minConcurrency, currentConcurrency - 1);
        console.log(`🔽 Reducing concurrency to ${currentConcurrency} (avg latency: ${avgLatency.toFixed(0)}ms)`);
      } else if (avgLatency < targetLatency * 0.7 && currentConcurrency < maxConcurrency) {
        // Fast enough, try increasing concurrency
        currentConcurrency = Math.min(maxConcurrency, currentConcurrency + 1);
        console.log(`🔼 Increasing concurrency to ${currentConcurrency} (avg latency: ${avgLatency.toFixed(0)}ms)`);
      }
      
      // Reset metrics for next adaptation cycle
      processedCount = 0;
      totalLatency = 0;
      lastAdaptationTime = Date.now();
    }
  }

  return {
    results,
    finalConcurrency: currentConcurrency,
    averageQuality: results.length > 0 
      ? results.reduce((sum, r) => sum + (r.qualityScore || 0), 0) / results.length 
      : 0
  };
}

export { Semaphore, withRetry, extractWithRetry }; 