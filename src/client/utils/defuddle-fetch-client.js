/**
 * CLIENT-ONLY: Browser-compatible content fetching and processing utilities
 * 
 * This file contains browser-specific code and should NEVER be imported in server code.
 * It uses DOMParser, document, window, and other browser APIs that are not available in Node.js.
 * 
 * For server-side content processing, use @server/utils/defuddle-fetch-server.js instead.
 * 
 * @fileoverview Client-side content fetching with DOM parsing and quality assessment
 */

/**
 * Client-side content fetching and processing utilities
 * Browser-compatible version - no Node.js dependencies
 */

import Defuddle from 'defuddle';

/**
 * Configuration for content cleaning operations
 * Centralized and maintainable approach instead of endless .replace() chains
 */
const CLEANING_CONFIG = {
  // HTML entities to decode (preserve semantic meaning)
  htmlEntities: {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x2F;': '/',
    '&apos;': "'",
    '&#39;': "'",
    '&hellip;': '...',
    '&mdash;': '—',
    '&ndash;': '–',
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&rdquo;': '"',
    '&ldquo;': '"',
    '&para;': '' // Remove pilcrow symbol
  },
  
  // Boilerplate phrases to remove (low-value content)
  boilerplatePhrases: [
    // Video-related boilerplate (remove with surrounding whitespace)
    /(\s*\n\s*)?Sorry, your browser doesn't support embedded video\.?(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Your browser doesn't support embedded video\.?(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Browser doesn't support embedded video\.?(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Video not supported\.?(\s*\n\s*)?/gi,
    
    // UI boilerplate
    /(\s*\n\s*)?Scroll For More(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Learn More About\s+\w+(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Made with.*cyberspace(\s*\n\s*)?/gi,
    
    // Legal boilerplate
    /(\s*\n\s*)?Cookie Policy(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Privacy Policy(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Terms of Service(\s*\n\s*)?/gi,
    /(\s*\n\s*)?All rights reserved(\s*\n\s*)?/gi,
    
    // Common UI elements
    /(\s*\n\s*)?Loading\.\.\.(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Please wait\.\.\.(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Click here to continue(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Enable JavaScript(\s*\n\s*)?/gi,
    /(\s*\n\s*)?JavaScript is required(\s*\n\s*)?/gi
  ],
  
  // HTML tags to remove completely (with content)
  removeWithContent: [
    'script',
    'style',
    'noscript',
    'iframe',
    'embed',
    'object',
    'applet',
    'video',
    'audio',
    'canvas',
    'svg'
  ],
  
  // HTML tags to remove but preserve content
  removeTagsOnly: [
    'nav',
    'header', 
    'footer',
    'aside',
    'div',
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'mark',
    'small',
    'sub',
    'sup'
  ],
  
  // HTML tags to convert to structural formatting
  structuralTags: {
    'h1': '# ',
    'h2': '## ',
    'h3': '### ',
    'h4': '#### ',
    'h5': '##### ',
    'h6': '###### ',
    'p': '\n',
    'br': '\n',
    'hr': '\n---\n',
    'li': '- ',
    'dt': '**',
    'dd': ': ',
    'blockquote': '> ',
    'pre': '```\n',
    'code': '`'
  },
  
  // Tags that should preserve their content with proper spacing
  preserveWithSpacing: [
    'p', 'div', 'section', 'article', 'main'
  ],
  
  // Code-related tags to preserve formatting
  codeTags: [
    'pre', 'code', 'samp', 'kbd', 'var'
  ],
  
  // Characters to normalize
  normalizeChars: {
    '¶': '', // Pilcrow symbol
    '\u00A0': ' ', // Non-breaking space
    '\u200B': '', // Zero-width space
    '\u200C': '', // Zero-width non-joiner
    '\u200D': '', // Zero-width joiner
    '\uFEFF': '' // Byte order mark
  }
};

/**
 * Apply Unicode normalization to fix encoding issues
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeUnicode(text) {
  if (!text) return '';
  
  // Apply NFC normalization (Canonical Composition)
  let normalized = text.normalize('NFC');
  
  // Fix common encoding errors
  const encodingFixes = {
    'cafÃ©': 'café',
    'naÃ¯ve': 'naïve',
    'rÃ©sumÃ©': 'résumé',
    'faÃ§ade': 'façade',
    'garÃ§on': 'garçon'
  };
  
  Object.entries(encodingFixes).forEach(([broken, fixed]) => {
    normalized = normalized.replace(new RegExp(broken, 'gi'), fixed);
  });
  
  return normalized;
}

/**
 * Clean whitespace while preserving structural formatting
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text with preserved structure
 */
function normalizeWhitespace(text) {
  if (!text) return '';
  
  return text
    // Remove pilcrow symbols (¶) and their HTML entities
    .replace(/¶/g, '')
    .replace(/&para;/gi, '')
    // Normalize multiple spaces to single spaces
    .replace(/[ \t]+/g, ' ')
    // Convert multiple newlines to single newlines
    .replace(/\n{2,}/g, '\n')
    // Remove leading/trailing whitespace from each line
    .split('\n').map(line => line.trim()).join('\n')
    // Remove leading/trailing whitespace from entire text
    .trim();
}

/**
 * Decode HTML entities using configuration
 * @param {string} text - Text with HTML entities
 * @returns {string} Text with decoded entities
 */
function decodeHtmlEntities(text) {
  if (!text) return '';
  
  let decoded = text;
  
  // Apply configured HTML entity mappings
  Object.entries(CLEANING_CONFIG.htmlEntities).forEach(([entity, replacement]) => {
    decoded = decoded.replace(new RegExp(entity, 'gi'), replacement);
  });
  
  // Remove any remaining HTML entities
  decoded = decoded.replace(/&[a-zA-Z0-9#]+;/g, ' ');
  
  return decoded;
}

/**
 * Remove boilerplate content using configuration
 * @param {string} text - Text to clean
 * @returns {string} Text with boilerplate removed
 */
function removeBoilerplate(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove boilerplate phrases
  CLEANING_CONFIG.boilerplatePhrases.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Remove repeated phrases (common with video error messages)
  const repeatedPhrases = [
    'Sorry, your browser doesn\'t support embedded video',
    'Your browser doesn\'t support embedded video',
    'Browser doesn\'t support embedded video',
    'Video not supported',
    'Loading...',
    'Please wait...'
  ];
  
  repeatedPhrases.forEach(phrase => {
    // Remove multiple consecutive occurrences of the same phrase
    const regex = new RegExp(`(\\s*\\n?\\s*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n?\\s*)+`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });
  
  return cleaned;
}

/**
 * Remove video-related content and error messages
 * @param {string} text - Text to clean
 * @returns {string} Text with video content removed
 */
function removeVideoContent(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove video error messages and related content
  const videoPatterns = [
    // Video error messages
    /(\s*\n\s*)?(Sorry, )?your browser doesn'?t support embedded video\.?(\s*\n\s*)?/gi,
    /(\s*\n\s*)?(Sorry, )?browser doesn'?t support embedded video\.?(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Video not supported\.?(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Video playback not supported\.?(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Unable to play video\.?(\s*\n\s*)?/gi,
    
    // Video player elements
    /(\s*\n\s*)?\[Video Player\](\s*\n\s*)?/gi,
    /(\s*\n\s*)?\[Video\](\s*\n\s*)?/gi,
    /(\s*\n\s*)?\[Media Player\](\s*\n\s*)?/gi,
    
    // Video controls and UI
    /(\s*\n\s*)?Play(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Pause(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Stop(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Volume(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Fullscreen(\s*\n\s*)?/gi,
    
    // Video format messages
    /(\s*\n\s*)?Video format not supported\.?(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Codec not supported\.?(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Flash Player required\.?(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Adobe Flash required\.?(\s*\n\s*)?/gi
  ];
  
  videoPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Remove consecutive video error messages
  const repeatedVideoErrors = /(\s*\n\s*)?(Sorry, )?(your )?browser doesn'?t support embedded video\.?(\s*\n\s*)?/gi;
  cleaned = cleaned.replace(new RegExp(`(${repeatedVideoErrors.source})+`, 'gi'), '');
  
  return cleaned;
}

/**
 * Remove Markdown formatting while preserving content
 * @param {string} text - Text to clean
 * @returns {string} Text with Markdown formatting removed
 */
function removeMarkdownFormatting(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove Markdown emphasis combinations first (***text***, **_text_**, etc.)
  cleaned = cleaned.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
  cleaned = cleaned.replace(/\*\*_(.*?)_\*\*/g, '$1');
  cleaned = cleaned.replace(/_\*\*(.*?)\*\*_/g, '$1');
  
  // Remove Markdown bold formatting (**text** or __text__)
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/__(.*?)__/g, '$1');
  
  // Remove Markdown italic formatting (*text* or _text_)
  // Use a more careful approach to avoid removing asterisks in code
  cleaned = cleaned.replace(/\b\*(.*?)\*\b/g, '$1');
  cleaned = cleaned.replace(/\b_(.*?)_\b/g, '$1');
  
  // Remove Markdown strikethrough formatting (~~text~~)
  cleaned = cleaned.replace(/~~(.*?)~~/g, '$1');
  
  // Remove Markdown inline code formatting (`text`)
  // But preserve code blocks (```text```) as they're structural
  cleaned = cleaned.replace(/\b`([^`]+)`\b/g, '$1');
  
  // Remove Markdown links ([text](url)) - keep only the text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // Remove Markdown images (![alt](url)) - keep only the alt text
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  
  return cleaned;
}

/**
 * Convert HTML to structured text while preserving formatting
 * @param {string} html - HTML content
 * @returns {string} Structured text content
 */
function cleanHtmlWithDOM(html) {
  if (!html || typeof window === 'undefined') {
    return html;
  }
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Remove unwanted elements completely
    CLEANING_CONFIG.removeWithContent.forEach(tagName => {
      const elements = doc.querySelectorAll(tagName);
      elements.forEach(el => el.remove());
    });
    
    // Remove navigation and UI elements but keep their content
    CLEANING_CONFIG.removeTagsOnly.forEach(tagName => {
      const elements = doc.querySelectorAll(tagName);
      elements.forEach(el => {
        // Replace with text content and proper spacing
        const textContent = el.textContent.trim();
        if (textContent) {
          const textNode = doc.createTextNode(textContent + '\n');
          el.parentNode.replaceChild(textNode, el);
        } else {
          el.remove();
        }
      });
    });
    
    // Convert structural elements to markdown
    return convertHtmlToStructuredText(doc.body || doc);
  } catch (error) {
    // Fallback to regex if DOM parsing fails
    return html.replace(/<[^>]*>/g, '');
  }
}

/**
 * Recursively convert HTML elements to structured text
 * @param {Element} element - DOM element to convert
 * @returns {string} Structured text
 */
function convertHtmlToStructuredText(element) {
  if (!element) return '';
  
  let result = '';
  
  // Handle text nodes
  if (element.nodeType === Node.TEXT_NODE) {
    return element.textContent || '';
  }
  
  // Handle element nodes
  if (element.nodeType === Node.ELEMENT_NODE) {
    const tagName = element.tagName.toLowerCase();
    const textContent = element.textContent.trim();
    
    // Skip empty elements
    if (!textContent) return '';
    
    // Handle structural tags
    if (CLEANING_CONFIG.structuralTags[tagName]) {
      const prefix = CLEANING_CONFIG.structuralTags[tagName];
      
      // Special handling for different tag types
      switch (tagName) {
        case 'pre':
          // Preserve code blocks with proper formatting
          result += '```\n' + textContent + '\n```\n\n';
          break;
          
        case 'code':
          // Handle inline code
          if (element.parentElement && element.parentElement.tagName.toLowerCase() === 'pre') {
            // Already handled by pre tag
            result += textContent;
          } else {
            result += '`' + textContent + '`';
          }
          break;
          
        case 'li':
          // Handle list items
          result += '- ' + textContent + '\n';
          break;
          
        case 'blockquote':
          // Handle blockquotes
          const lines = textContent.split('\n');
          lines.forEach(line => {
            if (line.trim()) result += '> ' + line.trim() + '\n';
          });
          break;
          
        case 'p':
        case 'div':
          // Handle paragraphs with single newlines
          if (textContent) {
            result += textContent + '\n';
          }
          break;
          
        case 'br':
          result += '\n';
          break;
          
        case 'hr':
          result += '\n---\n\n';
          break;
          
        default:
          // Handle headers and other structural elements
          result += prefix + textContent + '\n';
      }
    } else if (CLEANING_CONFIG.codeTags.includes(tagName)) {
      // Preserve code formatting
      result += '`' + textContent + '`';
    } else {
      // For other elements, process children recursively
      for (const child of element.childNodes) {
        result += convertHtmlToStructuredText(child);
      }
    }
  }
  
  return result;
}

/**
 * Normalize special characters using configuration
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeSpecialChars(text) {
  if (!text) return '';
  
  let normalized = text;
  
  Object.entries(CLEANING_CONFIG.normalizeChars).forEach(([char, replacement]) => {
    normalized = normalized.replace(new RegExp(char, 'g'), replacement);
  });
  
  return normalized;
}

/**
 * Strip HTML tags and decode HTML entities from text content
 * Browser environment only - uses DOM for parsing
 * Preserves only structurally meaningful formatting for LLMs
 * @param {string} text - Text that may contain HTML
 * @returns {string} Clean text with structural formatting preserved
 */
export function stripHTML(text) {
  if (!text) return '';

  // Apply cleaning pipeline in logical order
  let cleanText = text;
  
  // 1. Normalize Unicode and fix encoding issues
  cleanText = normalizeUnicode(cleanText);
  
  // 2. Remove boilerplate content
  cleanText = removeBoilerplate(cleanText);
  
  // 3. Remove video-related content specifically
  cleanText = removeVideoContent(cleanText);
  
  // 4. Clean HTML using DOM parsing
  cleanText = cleanHtmlWithDOM(cleanText);
  
  // 5. Decode HTML entities
  cleanText = decodeHtmlEntities(cleanText);
  
  // 6. Remove Markdown formatting
  cleanText = removeMarkdownFormatting(cleanText);
  
  // 7. Normalize special characters
  cleanText = normalizeSpecialChars(cleanText);
  
  // 8. Normalize whitespace
  cleanText = normalizeWhitespace(cleanText);

  return cleanText;
}

/**
 * Get document from HTML string using DOMParser (Browser only)
 * @param {string} html - HTML content
 * @param {string} url - URL for context
 * @returns {Document} DOM document
 */
function getDocumentFromHtml(html, url) {
  // Browser environment - use DOMParser
  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }
  
  // Browser fallback - use document.createElement
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.createElement) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv;
  }
  
  throw new Error('No suitable DOM implementation found for HTML parsing. This function requires a browser environment.');
}

/**
 * Configuration for content quality assessment
 */
const QUALITY_CONFIG = {
  // Minimum content length thresholds
  minLength: 30,
  preferredLength: 100,
  
  // Quality scoring weights
  weights: {
    length: 0.3,
    readability: 0.2,
    technical: 0.3,
    structure: 0.2
  },
  
  // Technical content indicators (boost score)
  technicalIndicators: [
    /function\s*\(/i,
    /class\s+\w+/i,
    /api\//i,
    /http[s]?:\/\//i,
    /\.(js|ts|html|css|json|xml|md|txt)$/i,
    /database|server|client/i,
    /import\s+|export\s+/i,
    /const\s+|let\s+|var\s+/i,
    /async\s+function/i,
    /Promise\./i,
    /fetch\(/i,
    /XMLHttpRequest/i
  ],
  
  // Structure indicators (boost score)
  structureIndicators: [
    /^#+\s+/m, // Markdown headers
    /^[-*+]\s+/m, // Lists
    /^\d+\.\s+/m, // Numbered lists
    /```[\s\S]*```/m, // Code blocks
    /`[^`]+`/g, // Inline code
    /\[.*?\]\(.*?\)/g, // Links
    /^\s*>\s+/m // Blockquotes
  ],
  
  // Readability indicators (boost score)
  readabilityIndicators: [
    /[.!?]\s+[A-Z]/g, // Proper sentence structure
    /[a-z][A-Z]/g, // camelCase
    /[A-Z][a-z]+[A-Z]/g, // PascalCase
    /[a-z]+_[a-z]+/g // snake_case
  ]
};

/**
 * Enhanced content quality assessment with semantic awareness
 * @param {string} content - Content to assess
 * @param {Object} options - Assessment options
 * @returns {Object} Quality assessment
 */
function assessContentQuality(content, options = {}) {
  const { minLength = QUALITY_CONFIG.minLength } = options;
  
  if (!content || content.length < minLength) {
    return {
      overallScore: 0,
      qualityLevel: 'poor',
      reason: 'Content too short',
      metrics: {
        length: 0,
        readability: 0,
        technical: 0,
        structure: 0
      }
    };
  }
  
  // Calculate basic metrics
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
  const charCount = content.replace(/\s+/g, '').length;
  const avgWordLength = wordCount > 0 ? charCount / wordCount : 0;
  
  // Length score (0-1)
  const lengthScore = Math.min(1.0, wordCount / QUALITY_CONFIG.preferredLength);
  
  // Readability score (0-1)
  let readabilityScore = 0;
  if (avgWordLength >= 3 && avgWordLength <= 8) {
    readabilityScore = 1.0; // Optimal word length
  } else if (avgWordLength > 0) {
    readabilityScore = Math.max(0.3, 1.0 - Math.abs(avgWordLength - 5.5) / 5.5);
  }
  
  // Technical content score (0-1)
  let technicalScore = 0;
  QUALITY_CONFIG.technicalIndicators.forEach(pattern => {
    if (pattern.test(content)) {
      technicalScore = Math.max(technicalScore, 0.8);
    }
  });
  
  // Structure score (0-1)
  let structureScore = 0;
  QUALITY_CONFIG.structureIndicators.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      structureScore = Math.min(1.0, structureScore + (matches.length * 0.2));
    }
  });
  
  // Calculate weighted overall score
  const overallScore = (
    lengthScore * QUALITY_CONFIG.weights.length +
    readabilityScore * QUALITY_CONFIG.weights.readability +
    technicalScore * QUALITY_CONFIG.weights.technical +
    structureScore * QUALITY_CONFIG.weights.structure
  );
  
  // Determine quality level
  let qualityLevel = 'low';
  if (overallScore >= 0.7) qualityLevel = 'high';
  else if (overallScore >= 0.4) qualityLevel = 'medium';
  
  return {
    overallScore: Math.min(1.0, overallScore),
    qualityLevel,
    reason: `Word count: ${wordCount}, avg word length: ${avgWordLength.toFixed(1)}, technical: ${technicalScore > 0 ? 'yes' : 'no'}, structure: ${structureScore > 0 ? 'yes' : 'no'}`,
    metrics: {
      length: lengthScore,
      readability: readabilityScore,
      technical: technicalScore,
      structure: structureScore,
      wordCount,
      avgWordLength
    }
  };
}

/**
 * Batch fetch and clean multiple URLs (client-side version)
 * @param {string[]} urls - Array of URLs to process
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Results with summary
 */
export async function batchFetchAndClean(urls, options = {}) {
  const {
    concurrency = 3, // Lower concurrency for client-side
    qualityThreshold = 0.2, // Match the default in fetchAndClean
    onProgress = () => {},
    onError = () => {},
    onQualityFilter = () => {}
  } = options;

  const results = [];
  const errors = [];
  const qualityFiltered = []; // Track URLs filtered due to quality
  let completed = 0;
  
  // Metrics collection
  const metrics = {
    totalUrls: urls.length,
    successful: 0,
    failed: 0,
    qualityFiltered: 0,
    httpErrors: {
      404: 0,
      500: 0,
      other: 0
    },
    extractionMethods: {
      defuddle: 0,
      stripHTML: 0
    },
    extractionReasons: {},
    qualityScores: [],
    wordCounts: []
  };

  const processUrl = async (url) => {
    try {
      const result = await fetchAndClean(url, { 
        qualityThreshold,
        urlSpecificOptions: options.urlSpecificOptions
      });
      
      // Collect metrics for successful results
      metrics.successful++;
      metrics.extractionMethods[result.extractionMethod]++;
      metrics.extractionReasons[result.extractionReason] = (metrics.extractionReasons[result.extractionReason] || 0) + 1;
      metrics.qualityScores.push(result.qualityScore);
      metrics.wordCounts.push(result.wordCount);
      
      results.push(result);
      completed++;
      onProgress(completed, urls.length, url, result.qualityScore);
    } catch (error) {
      // Check if this is a quality threshold error
      if (error.message.includes('Content quality too low')) {
        metrics.qualityFiltered++;
        const qualityScore = 0.1; // Default low score for filtered content
        
        qualityFiltered.push({ 
          url, 
          error: error.message,
          qualityScore: qualityScore
        });
        onQualityFilter(url, qualityScore, error.message);
      } else {
        metrics.failed++;
        
        // Track HTTP errors
        if (error.message.includes('HTTP 404')) {
          metrics.httpErrors[404]++;
        } else if (error.message.includes('HTTP 500')) {
          metrics.httpErrors[500]++;
        } else if (error.message.includes('HTTP')) {
          metrics.httpErrors.other++;
        }
        
        errors.push({ url, error: error.message });
        onError(url, error);
      }
      completed++;
      onProgress(completed, urls.length, url, 0);
    }
  };

  // Process with controlled concurrency
  const chunks = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    chunks.push(urls.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(processUrl));
  }

  // Calculate additional metrics
  const avgQualityScore = metrics.qualityScores.length > 0 
    ? metrics.qualityScores.reduce((a, b) => a + b, 0) / metrics.qualityScores.length 
    : 0;
  const avgWordCount = metrics.wordCounts.length > 0 
    ? metrics.wordCounts.reduce((a, b) => a + b, 0) / metrics.wordCounts.length 
    : 0;
  const totalWords = metrics.wordCounts.reduce((a, b) => a + b, 0);

  return {
    results,
    errors,
    qualityFiltered,
    metrics: {
      ...metrics,
      avgQualityScore,
      avgWordCount,
      totalWords
    },
    summary: {
      total: urls.length,
      successful: results.length,
      failed: errors.length,
      qualityFiltered: qualityFiltered.length
    }
  };
}

/**
 * Fetch and clean content from a URL (client-side version)
 * @param {string} url - URL to fetch
 * @param {Object} options - Options for fetching and cleaning
 * @returns {Promise<Object>} Cleaned content with metadata
 */
export async function fetchAndClean(url, options = {}) {
  const {
    timeout = 30000,
    userAgent = 'Mozilla/5.0 (compatible; PermawebLLMFuel/1.0)',
    qualityThreshold = 0.2,
    contentSelectors = null,
    urlSpecificOptions
  } = options;

  // Get URL-specific options if available
  const urlOptions = urlSpecificOptions?.[url] || {};
  const finalContentSelectors = urlOptions.contentSelectors || contentSelectors;

  try {
    // Fetch the page
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    // Handle plain text files
    if (contentType.includes('text/plain') || url.endsWith('.txt')) {
      const cleanText = stripHTML(html);
      const wordCount = cleanText.split(/\s+/).filter(word => word.length > 0).length;
      
      return {
        url,
        title: generateTitleFromUrl(url),
        content: cleanText,
        wordCount,
        qualityScore: 1.0, // Plain text files are considered high quality
        source: 'plain-text'
      };
    }

    // Parse HTML with DOMParser
    const doc = getDocumentFromHtml(html, url);

    // Extract title
    let title = '';
    const titleElement = doc.querySelector('title, h1');
    if (titleElement) {
      title = titleElement.textContent.trim();
    }
    // Fallback if title is empty or generic
    const genericTitle = /^(|untitled document|index|home|get(ting)? started)$/i;
    if (!title || genericTitle.test(title)) {
      title = generateTitleFromUrl(url);
    }

    // Extract content using extractContent (Defuddle with fallback)
    const extractionResult = extractContent(doc);
    const content = extractionResult.content;
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    
    // Assess quality
    const qualityAssessment = assessContentQuality(content, {
      minLength: 30, // Further reduced from 50 to 30
      requireTechnical: false
    });
    const qualityScore = qualityAssessment.overallScore;

    // Quality check
    if (qualityScore < qualityThreshold) {
      throw new Error(`Content quality too low: ${qualityScore.toFixed(2)} < ${qualityThreshold}`);
    }

    return {
      url,
      title: cleanTitle(title),
      content: content.trim(),
      wordCount,
      qualityScore,
      source: 'html',
      extractionMethod: extractionResult.method,
      extractionReason: extractionResult.reason
    };

  } catch (error) {
    throw new Error(`Failed to fetch and clean ${url}: ${error.message}`);
  }
}

/**
 * Generate llms.txt format from cleaned documents
 * @param {Array} documents - Array of cleaned document objects
 * @param {Object} options - Generation options
 * @param {Array} qualityFiltered - Array of URLs filtered due to quality threshold
 * @returns {string} Formatted llms.txt content
 */
export function generateLLMsTxt(documents, options = {}, qualityFiltered = []) {
  const {
    includeMetadata = true,
    includeQualityScores = false,
    sortByQuality = true,
    maxDocuments = null,
    includeQualityDisclaimer = true
  } = options;

  if (!Array.isArray(documents) || documents.length === 0) {
    throw new Error('No documents provided for llms.txt generation');
  }

  // Sort by quality if requested
  let sortedDocs = [...documents];
  if (sortByQuality) {
    sortedDocs.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
  }

  // Limit documents if specified
  if (maxDocuments && maxDocuments > 0) {
    sortedDocs = sortedDocs.slice(0, maxDocuments);
  }

  let llmsContent = '';

  // Add header
  llmsContent += '# Permaweb Documentation Collection\n\n';
  llmsContent += `Generated on: ${new Date().toISOString()}\n`;
  llmsContent += `Total documents: ${sortedDocs.length}\n`;
  llmsContent += `Total words: ${sortedDocs.reduce((sum, doc) => sum + (doc.wordCount || 0), 0)}\n\n`;

  // Add Table of Contents
  llmsContent += '## Table of Contents\n\n';
  
  // Add successful documents to ToC
  if (sortedDocs.length > 0) {
    llmsContent += '### Included Documents\n\n';
    for (let i = 0; i < sortedDocs.length; i++) {
      const doc = sortedDocs[i];
      let title = cleanDocumentTitle(doc.title) || '';
      const genericTitle = /^(|untitled document|index|home|get(ting)? started)$/i;
      if (!title || genericTitle.test(title)) {
        title = generateTitleFromUrl(doc.url);
      }
      llmsContent += `${i + 1}. [${title}](${doc.url})\n`;
    }
    llmsContent += '\n';
  }

  // Add quality-filtered URLs to ToC
  if (includeQualityDisclaimer && qualityFiltered && qualityFiltered.length > 0) {
    llmsContent += '### Excluded Documents (Quality Filtered)\n\n';
    
    // Sort quality filtered URLs by quality score (lowest first)
    const sortedFiltered = [...qualityFiltered].sort((a, b) => (a.qualityScore || 0) - (b.qualityScore || 0));
    
    for (let i = 0; i < sortedFiltered.length; i++) {
      const filtered = sortedFiltered[i];
      llmsContent += `${i + 1}. ${filtered.url}\n`;
    }
    llmsContent += '\n';
  }

  llmsContent += '---\n\n';

  // Process each document
  for (let i = 0; i < sortedDocs.length; i++) {
    const doc = sortedDocs[i];
    
    // Document separator
    if (i > 0) {
      llmsContent += '\n---\n\n';
    }

    // Document header with number
    llmsContent += `# ${i + 1}. ${doc.title || 'Untitled Document'}\n\n`;
    
    if (includeMetadata) {
      llmsContent += `Document Number: ${i + 1}\n`;
      llmsContent += `Source: ${doc.url}\n`;
      llmsContent += `Words: ${doc.wordCount || 0}\n`;
      if (includeQualityScores && doc.qualityScore !== undefined) {
        llmsContent += `Quality Score: ${doc.qualityScore.toFixed(3)}\n`;
      }
      llmsContent += `Extraction Method: ${doc.source || 'unknown'}\n\n`;
    }

    // Document content
    if (doc.content) {
      llmsContent += doc.content + '\n';
    }
  }

  return llmsContent;
}

/**
 * Generate llms.txt content from batch processing results
 * @param {Object} batchResults - Results from batchFetchAndClean
 * @param {Object} options - Generation options
 * @returns {string} Formatted llms.txt content
 */
export function generateLLMsTxtFromBatchResults(batchResults, options = {}) {
  const { results, qualityFiltered } = batchResults;
  return generateLLMsTxt(results, options, qualityFiltered);
}

/**
 * Download content as a file
 * @param {string} content - The content to download
 * @param {string} filename - The filename for the download
 * @param {string} mimeType - MIME type for the file
 */
export function downloadFile(content, filename = 'llms.txt', mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

/**
 * Open content in a new tab as raw text (client-side solution for static sites)
 * @param {string} content - The content to display
 * @param {string} filename - The filename for the content
 */
export function openContentInNewTab(content, filename = 'llms.txt') {
  // Create a blob with the content
  const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Open in new tab
  const newWindow = window.open(url, '_blank');

  if (newWindow) {
    // Set a title for the new window/tab
    newWindow.document.title = filename;

    // Clean up the blob URL after a short delay
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  } else {
    // If popup blocked, clean up immediately and throw error
    URL.revokeObjectURL(url);
    throw new Error('Popup blocked - please allow popups for this site');
  }
}

/**
 * Generate title from URL when no title is available
 * @param {string} url - URL to generate title from
 * @returns {string} Generated title
 */
function generateTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let pathParts = urlObj.pathname.split('/').filter(Boolean);
    let last = pathParts[pathParts.length - 1] || '';
    let parent = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
    // Remove file extension
    last = last.replace(/\.(html?|php|aspx?|md|txt)$/i, '');
    // If last is empty or generic, use parent or domain
    const generic = /^(index|home|readme)?$/i;
    if (!last || generic.test(last)) {
      last = parent || urlObj.hostname.replace(/^www\./, '');
      parent = '';
    }
    // Prettify
    let pretty = last.replace(/[-_]/g, ' ');
    pretty = pretty.charAt(0).toUpperCase() + pretty.slice(1);
    // Add parent or domain context if available
    let context = '';
    if (parent && !generic.test(parent)) {
      context = parent.replace(/[-_]/g, ' ');
      context = context.charAt(0).toUpperCase() + context.slice(1);
    } else {
      context = urlObj.hostname.replace(/^www\./, '');
      context = context.split('.')[0];
      context = context.charAt(0).toUpperCase() + context.slice(1);
    }
    if (context && context.toLowerCase() !== pretty.toLowerCase()) {
      pretty += ` - ${context}`;
    }
    // Fallback
    if (!pretty.trim()) return 'Untitled Document';
    return pretty.trim();
  } catch {
    // Fallback: parse last segment of path manually
    try {
      const pathMatch = url.match(/\/([^\/]+)\/?$/);
      let last = pathMatch ? pathMatch[1] : url;
      last = last.replace(/\.(html?|php|aspx?|md|txt)$/i, '');
      last = last.replace(/[-_]/g, ' ');
      last = last.charAt(0).toUpperCase() + last.slice(1);
      return last || 'Untitled Document';
    } catch {
      return 'Untitled Document';
    }
  }
}

/**
 * Extract breadcrumbs from URL
 * @param {string} url - URL to extract breadcrumbs from
 * @returns {string} Breadcrumb path
 */
function extractBreadcrumbsFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    if (pathParts.length === 0) {
      return urlObj.hostname;
    }
    
    // Remove file extensions from the last part
    const lastPart = pathParts[pathParts.length - 1].replace(/\.(html?|php|aspx?|md|txt)$/i, '');
    pathParts[pathParts.length - 1] = lastPart;
    
    // Convert to readable format
    const breadcrumbs = pathParts
      .map(part => part.replace(/[-_]/g, ' '))
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' > ');
    
    return `${urlObj.hostname} > ${breadcrumbs}`;
  } catch {
    // Fallback to just the URL if parsing fails
    return url;
  }
}

/**
 * Clean document title by removing redundant site names
 * @param {string} title - Raw title text
 * @returns {string} Cleaned title
 */
function cleanDocumentTitle(title) {
  if (!title) return '';
  
  // Remove common redundant site name patterns
  let cleaned = title
    .replace(/\s*-\s*(Cookbook|ARIO Docs|HyperBEAM - Documentation|Cooking with the Permaweb)\s*$/gi, '')
    .replace(/\s*Cookbook\s*$/gi, '')
    .replace(/\s*ARIO Docs\s*$/gi, '')
    .replace(/\s*HyperBEAM - Documentation\s*$/gi, '')
    .replace(/\s*Cooking with the Permaweb\s*$/gi, '')
    .replace(/\s*-\s*ARIO Docs\s*$/gi, '')
    .replace(/\s*-\s*Cookbook\s*$/gi, '')
    .replace(/\s*-\s*HyperBEAM - Documentation\s*$/gi, '')
    .replace(/\s*-\s*Cooking with the Permaweb\s*$/gi, '');
  
  // Clean up any remaining whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Clean title text
 * @param {string} title - Raw title text
 * @returns {string} Cleaned title
 */
function cleanTitle(title) {
  return title
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-\(\)\[\]]/g, '')
    .trim()
    .substring(0, 200);
}

/**
 * Configuration for content extraction strategies
 */
const EXTRACTION_CONFIG = {
  // Content selectors to try in order of preference
  contentSelectors: [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '.main-content',
    '#content',
    '#main',
    'body'
  ],
  
  // Elements to exclude from content extraction
  excludeSelectors: [
    'nav',
    'header',
    'footer',
    'aside',
    '.sidebar',
    '.navigation',
    '.menu',
    '.breadcrumb',
    '.pagination',
    '.comments',
    '.advertisement',
    '.ads',
    '[class*="ad-"]',
    '[id*="ad-"]'
  ],
  
  // Minimum content length to consider valid
  minContentLength: 50,
  
  // Quality indicators that boost content score
  qualityIndicators: [
    /function\s*\(/i,
    /class\s+\w+/i,
    /api\//i,
    /http[s]?:\/\//i,
    /\.(js|ts|html|css|json|xml|md|txt)$/i,
    /database|server|client/i,
    /import\s+|export\s+/i,
    /const\s+|let\s+|var\s+/i
  ]
};

/**
 * Extract content using semantic DOM analysis (fallback method)
 * @param {Document} doc - DOM document
 * @returns {Object} Extraction result with content and metadata
 */
function extractContentSemantically(doc) {
  // Try content selectors in order of preference
  for (const selector of EXTRACTION_CONFIG.contentSelectors) {
    const element = doc.querySelector(selector);
    if (element && element.textContent.trim().length > EXTRACTION_CONFIG.minContentLength) {
      // Remove excluded elements
      EXTRACTION_CONFIG.excludeSelectors.forEach(excludeSelector => {
        const excludedElements = element.querySelectorAll(excludeSelector);
        excludedElements.forEach(el => el.remove());
      });
      
      const content = element.textContent.trim();
      if (content.length > EXTRACTION_CONFIG.minContentLength) {
        const quality = assessContentQuality(content);
        
        // Only return if quality is acceptable (lower threshold for fallback)
        if (quality.overallScore > 0.05) {
          return {
            content,
            method: 'semantic_dom',
            reason: `found_content_in_${selector}`,
            quality,
            wordCount: content.split(/\s+/).filter(word => word.length > 0).length
          };
        } else {
          return {
            content: null,
            method: 'semantic_dom',
            reason: 'low_quality',
            quality,
            error: `Content quality too low: ${quality.overallScore.toFixed(3)}`
          };
        }
      }
    }
  }
  
  return {
    content: null,
    method: 'semantic_dom',
    reason: 'no_suitable_content_found',
    error: 'No suitable content found in any semantic selector'
  };
}

/**
 * Extract content using Defuddle library with semantic DOM fallback
 * @param {Document} doc - DOM document
 * @param {string} url - URL for context
 * @returns {Object} Extraction result
 */
function extractContentWithDefuddle(doc, url) {
  try {
    const defuddle = new Defuddle(doc, {
      markdown: true,
      debug: false,
      url: url
    });
    
    const result = defuddle.parse();
    
    // Check if Defuddle returned valid content
    if (result && result.content) {
      const content = result.content.trim();
      
      // Check if Defuddle returned HTML instead of clean text
      const containsHtml = /<[^>]+>/.test(content);
      
      if (containsHtml) {
        // Defuddle returned HTML - try semantic DOM analysis on the HTML
        try {
          const htmlDoc = new DOMParser().parseFromString(content, 'text/html');
          const semanticResult = extractContentSemantically(htmlDoc);
          
          if (semanticResult && semanticResult.content) {
            return {
              content: semanticResult.content,
              method: 'defuddle_semantic',
              reason: 'defuddle_returned_html_semantic_extracted',
              quality: semanticResult.quality,
              wordCount: semanticResult.wordCount,
              originalDefuddleContent: content.substring(0, 200) + '...'
            };
          }
        } catch (semanticError) {
          // If semantic analysis fails, fall back to cleaning the HTML
          const cleanedContent = cleanHtmlWithDOM(content);
          if (cleanedContent.length > EXTRACTION_CONFIG.minContentLength) {
            const quality = assessContentQuality(cleanedContent);
            if (quality.overallScore > 0.1) {
              return {
                content: cleanedContent,
                method: 'defuddle_cleaned',
                reason: 'defuddle_returned_html_cleaned',
                quality,
                wordCount: cleanedContent.split(/\s+/).filter(word => word.length > 0).length,
                originalDefuddleContent: content.substring(0, 200) + '...'
              };
            }
          }
        }
      }
      
      // Defuddle returned clean text (no HTML)
      if (content.length > EXTRACTION_CONFIG.minContentLength) {
        const quality = assessContentQuality(content);
        
        // Only return if quality is acceptable
        if (quality.overallScore > 0.1) {
          return {
            content,
            method: 'defuddle',
            reason: 'success_clean_text',
            quality,
            wordCount: content.split(/\s+/).filter(word => word.length > 0).length
          };
        } else {
          return {
            content: null,
            method: 'defuddle',
            reason: 'low_quality',
            quality,
            error: `Content quality too low: ${quality.overallScore.toFixed(3)}`
          };
        }
      } else {
        return {
          content: null,
          method: 'defuddle',
          reason: 'too_short',
          error: `Content too short: ${content.length} chars`
        };
      }
    } else {
      return {
        content: null,
        method: 'defuddle',
        reason: 'no_content',
        error: 'Defuddle returned no content'
      };
    }
  } catch (error) {
    return {
      content: null,
      method: 'defuddle',
      reason: 'error',
      error: error.message
    };
  }
}

/**
 * Extract content using fallback methods (last resort)
 * @param {Document|string} html - HTML content
 * @returns {Object} Extraction result
 */
function extractContentFallback(html) {
  let content = '';
  
  if (typeof html === 'string') {
    content = stripHTML(html);
  } else if (html && html.body) {
    content = stripHTML(html.body.innerHTML);
  } else if (html && html.textContent) {
    content = html.textContent.trim();
  }
  
  if (content.length > EXTRACTION_CONFIG.minContentLength) {
    const quality = assessContentQuality(content);
    
    // Very lenient quality threshold for fallback
    if (quality.overallScore > 0.01) {
      return {
        content,
        method: 'fallback',
        reason: 'stripHTML_success',
        quality,
        wordCount: content.split(/\s+/).filter(word => word.length > 0).length
      };
    } else {
      return {
        content: null,
        method: 'fallback',
        reason: 'low_quality',
        quality,
        error: `Fallback content quality too low: ${quality.overallScore.toFixed(3)}`
      };
    }
  }
  
  return {
    content: content || '',
    method: 'fallback',
    reason: 'min_length_not_met',
    quality: { overallScore: 0, qualityLevel: 'poor' },
    error: `Content too short: ${content.length} chars`
  };
}

/**
 * Extracts main content using Defuddle with semantic DOM enhancement
 * @param {string|Document} html - HTML string or Document to extract from
 * @param {string} url - URL for context (optional)
 * @returns {Object} Object with content and metadata about extraction method
 */
export function extractContent(html, url = '') {
  let doc = null;
  
  // Parse HTML to Document if needed
  if (typeof html === 'string') {
    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
      try {
        doc = new DOMParser().parseFromString(html, 'text/html');
      } catch (error) {
        return extractContentFallback(html);
      }
    } else {
      return extractContentFallback(html);
    }
  } else if (html && typeof html === 'object' && html.nodeType === 9) {
    doc = html;
  } else {
    return extractContentFallback(html);
  }
  
  // Strategy 1: Defuddle with semantic DOM enhancement
  // This handles cases where Defuddle returns HTML instead of clean text
  const defuddleResult = extractContentWithDefuddle(doc, url);
  if (defuddleResult && defuddleResult.content) {
    return defuddleResult;
  }
  
  // Strategy 2: Direct semantic DOM analysis (fallback)
  const semanticResult = extractContentSemantically(doc);
  if (semanticResult && semanticResult.content) {
    return semanticResult;
  }
  
  // Strategy 3: Basic HTML stripping (last resort)
  return extractContentFallback(doc);
}

/**
 * Enhanced parsing report with detailed quality metrics
 * @param {Object} batchResults - Results from batchFetchAndClean
 * @returns {string} Formatted report
 */
export function generateParsingReport(batchResults) {
  const { metrics, results, errors, qualityFiltered } = batchResults;
  
  let report = '📊 PERMWEB LLM FUEL - ENHANCED PARSING REPORT\n';
  report += '=' .repeat(60) + '\n\n';
  
  // Overall Statistics
  report += '📈 OVERALL STATISTICS\n';
  report += '-'.repeat(30) + '\n';
  report += `Total URLs processed: ${metrics.totalUrls}\n`;
  report += `Successful extractions: ${metrics.successful} (${((metrics.successful / metrics.totalUrls) * 100).toFixed(1)}%)\n`;
  report += `Failed extractions: ${metrics.failed} (${((metrics.failed / metrics.totalUrls) * 100).toFixed(1)}%)\n`;
  report += `Quality filtered: ${metrics.qualityFiltered} (${((metrics.qualityFiltered / metrics.totalUrls) * 100).toFixed(1)}%)\n`;
  report += `Total words extracted: ${metrics.totalWords.toLocaleString()}\n`;
  report += `Average words per document: ${metrics.avgWordCount.toFixed(0)}\n`;
  report += `Average quality score: ${metrics.avgQualityScore.toFixed(3)}\n\n`;
  
  // Enhanced Extraction Methods
  report += '🔧 EXTRACTION METHODS (Enhanced)\n';
  report += '-'.repeat(40) + '\n';
  const methodCounts = {};
  results.forEach(result => {
    methodCounts[result.extractionMethod] = (methodCounts[result.extractionMethod] || 0) + 1;
  });
  
  Object.entries(methodCounts).forEach(([method, count]) => {
    const percentage = ((count / metrics.successful) * 100).toFixed(1);
    report += `${method}: ${count} (${percentage}%)\n`;
  });
  report += '\n';
  
  // Quality Analysis
  if (metrics.qualityScores.length > 0) {
    report += '📊 QUALITY ANALYSIS\n';
    report += '-'.repeat(30) + '\n';
    
    const highQuality = metrics.qualityScores.filter(score => score >= 0.7).length;
    const mediumQuality = metrics.qualityScores.filter(score => score >= 0.4 && score < 0.7).length;
    const lowQuality = metrics.qualityScores.filter(score => score < 0.4).length;
    
    report += `High quality (≥0.7): ${highQuality} (${((highQuality / metrics.successful) * 100).toFixed(1)}%)\n`;
    report += `Medium quality (0.4-0.7): ${mediumQuality} (${((mediumQuality / metrics.successful) * 100).toFixed(1)}%)\n`;
    report += `Low quality (<0.4): ${lowQuality} (${((lowQuality / metrics.successful) * 100).toFixed(1)}%)\n\n`;
    
    // Quality score distribution
    const scoreRanges = [
      { min: 0.9, max: 1.0, label: 'Excellent (0.9-1.0)' },
      { min: 0.7, max: 0.9, label: 'Good (0.7-0.9)' },
      { min: 0.5, max: 0.7, label: 'Fair (0.5-0.7)' },
      { min: 0.3, max: 0.5, label: 'Poor (0.3-0.5)' },
      { min: 0.0, max: 0.3, label: 'Very Poor (0.0-0.3)' }
    ];
    
    scoreRanges.forEach(range => {
      const count = metrics.qualityScores.filter(score => score >= range.min && score < range.max).length;
      if (count > 0) {
        report += `${range.label}: ${count} (${((count / metrics.successful) * 100).toFixed(1)}%)\n`;
      }
    });
    report += '\n';
  }
  
  // Content Structure Analysis
  report += '🏗️ CONTENT STRUCTURE ANALYSIS\n';
  report += '-'.repeat(40) + '\n';
  
  const structureStats = {
    hasHeaders: 0,
    hasLists: 0,
    hasCode: 0,
    hasLinks: 0,
    technicalContent: 0
  };
  
  results.forEach(result => {
    const content = result.content || '';
    if (/^#+\s+/m.test(content)) structureStats.hasHeaders++;
    if (/^[-*+]\s+/m.test(content)) structureStats.hasLists++;
    if (/```[\s\S]*```|`[^`]+`/m.test(content)) structureStats.hasCode++;
    if (/\[.*?\]\(.*?\)/g.test(content)) structureStats.hasLinks++;
    if (QUALITY_CONFIG.technicalIndicators.some(pattern => pattern.test(content))) {
      structureStats.technicalContent++;
    }
  });
  
  Object.entries(structureStats).forEach(([stat, count]) => {
    const percentage = ((count / metrics.successful) * 100).toFixed(1);
    report += `${stat.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${count} (${percentage}%)\n`;
  });
  report += '\n';
  
  // Error Analysis
  if (errors.length > 0) {
    report += '❌ ERROR ANALYSIS\n';
    report += '-'.repeat(30) + '\n';
    
    const errorTypes = {};
    errors.forEach(error => {
      const errorType = error.error.includes('HTTP 404') ? '404 Not Found' :
                       error.error.includes('HTTP 500') ? '500 Server Error' :
                       error.error.includes('HTTP') ? 'Other HTTP Error' :
                       error.error.includes('timeout') ? 'Timeout' :
                       error.error.includes('network') ? 'Network Error' :
                       'Other Error';
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    });
    
    Object.entries(errorTypes).forEach(([type, count]) => {
      report += `${type}: ${count}\n`;
    });
    report += '\n';
  }
  
  // Performance Summary
  report += '⚡ PERFORMANCE SUMMARY\n';
  report += '-'.repeat(30) + '\n';
  report += `Success rate: ${((metrics.successful / metrics.totalUrls) * 100).toFixed(1)}%\n`;
  report += `Average content quality: ${metrics.avgQualityScore.toFixed(3)}\n`;
  report += `Total content extracted: ${metrics.totalWords.toLocaleString()} words\n`;
  report += `Average words per document: ${metrics.avgWordCount.toFixed(0)}\n`;
  report += `Content density: ${(metrics.totalWords / metrics.totalUrls).toFixed(1)} words/URL\n\n`;
  
  report += '=' .repeat(60) + '\n';
  report += `Report generated: ${new Date().toISOString()}\n`;
  report += `Enhanced content extraction with semantic preservation\n`;
  
  return report;
}

/**
 * Utility function to validate and clean URLs before processing
 * @param {string} url - URL to validate
 * @returns {string|null} Cleaned URL or null if invalid
 */
export function validateAndCleanUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  try {
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    const urlObj = new URL(url);
    
    // Basic validation
    if (!urlObj.hostname || urlObj.hostname.length < 3) return null;
    
    // Remove common tracking parameters
    const cleanParams = new URLSearchParams();
    for (const [key, value] of urlObj.searchParams) {
      if (!['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].includes(key)) {
        cleanParams.set(key, value);
      }
    }
    
    urlObj.search = cleanParams.toString();
    return urlObj.toString();
  } catch {
    return null;
  }
}

/**
 * Get content processing statistics for a single document
 * @param {Object} document - Document object with content and metadata
 * @returns {Object} Processing statistics
 */
export function getDocumentStats(document) {
  if (!document || !document.content) {
    return {
      wordCount: 0,
      charCount: 0,
      avgWordLength: 0,
      qualityScore: 0,
      hasStructure: false,
      isTechnical: false,
      extractionMethod: 'none'
    };
  }
  
  const content = document.content;
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
  const charCount = content.replace(/\s+/g, '').length;
  const avgWordLength = wordCount > 0 ? charCount / wordCount : 0;
  
  const hasStructure = QUALITY_CONFIG.structureIndicators.some(pattern => pattern.test(content));
  const isTechnical = QUALITY_CONFIG.technicalIndicators.some(pattern => pattern.test(content));
  
  return {
    wordCount,
    charCount,
    avgWordLength: Math.round(avgWordLength * 10) / 10,
    qualityScore: document.qualityScore || 0,
    hasStructure,
    isTechnical,
    extractionMethod: document.extractionMethod || 'unknown',
    extractionReason: document.extractionReason || 'unknown'
  };
}

/**
 * Analyze extraction performance across multiple documents
 * @param {Array} documents - Array of document objects
 * @returns {Object} Performance analysis
 */
export function analyzeExtractionPerformance(documents) {
  const analysis = {
    totalDocuments: documents.length,
    successfulExtractions: 0,
    failedExtractions: 0,
    methodBreakdown: {},
    reasonBreakdown: {},
    qualityDistribution: {
      high: 0,
      medium: 0,
      low: 0
    },
    avgQualityScore: 0,
    avgWordCount: 0
  };
  
  let totalQualityScore = 0;
  let totalWordCount = 0;
  
  documents.forEach(doc => {
    if (doc.content && doc.content.length > 0) {
      analysis.successfulExtractions++;
      
      // Track extraction method
      const method = doc.extractionMethod || 'unknown';
      analysis.methodBreakdown[method] = (analysis.methodBreakdown[method] || 0) + 1;
      
      // Track extraction reason
      const reason = doc.extractionReason || 'unknown';
      analysis.reasonBreakdown[reason] = (analysis.reasonBreakdown[reason] || 0) + 1;
      
      // Track quality
      const qualityScore = doc.qualityScore || 0;
      totalQualityScore += qualityScore;
      
      if (qualityScore >= 0.7) analysis.qualityDistribution.high++;
      else if (qualityScore >= 0.4) analysis.qualityDistribution.medium++;
      else analysis.qualityDistribution.low++;
      
      // Track word count
      const wordCount = doc.wordCount || 0;
      totalWordCount += wordCount;
    } else {
      analysis.failedExtractions++;
    }
  });
  
  // Calculate averages
  if (analysis.successfulExtractions > 0) {
    analysis.avgQualityScore = totalQualityScore / analysis.successfulExtractions;
    analysis.avgWordCount = totalWordCount / analysis.successfulExtractions;
  }
  
  // Calculate percentages
  analysis.successRate = (analysis.successfulExtractions / analysis.totalDocuments) * 100;
  
  // Calculate Defuddle-related success rates
  const defuddleMethods = ['defuddle', 'defuddle_semantic', 'defuddle_cleaned'];
  const defuddleSuccesses = defuddleMethods.reduce((sum, method) => 
    sum + (analysis.methodBreakdown[method] || 0), 0);
  analysis.defuddleSuccessRate = defuddleSuccesses > 0 
    ? (defuddleSuccesses / analysis.successfulExtractions) * 100 
    : 0;
  
  // Calculate semantic DOM success rates
  const semanticMethods = ['semantic_dom', 'defuddle_semantic'];
  const semanticSuccesses = semanticMethods.reduce((sum, method) => 
    sum + (analysis.methodBreakdown[method] || 0), 0);
  analysis.semanticSuccessRate = semanticSuccesses > 0 
    ? (semanticSuccesses / analysis.successfulExtractions) * 100 
    : 0;
  
  return analysis;
}