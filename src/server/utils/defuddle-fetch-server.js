import Defuddle from 'defuddle';
import { enhancedDefuddleExtraction } from './content-enhancer.js';
import { assessContentQuality } from './quality-scorer.js';
import { optimizedBatchExtraction } from './batch-processor.js';

// Import content filters from crawler
import { applyContentFilters } from './crawler.js';

/**
 * Strip HTML tags and decode HTML entities from text content
 * Node.js environment only - uses manual processing
 * Preserves only structurally meaningful formatting for LLMs
 * @param {string} text - Text that may contain HTML
 * @returns {string} Clean text with structural formatting preserved
 */
function stripHTML(text) {
  if (!text) return '';
  
  let cleanText = text
    // Remove script and style content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove navigation and UI elements
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    // Remove common UI text patterns
    .replace(/Sorry, your browser doesn't support embedded video/gi, '')
    .replace(/Scroll For More/gi, '')
    .replace(/Learn More About/gi, '')
    .replace(/Made with.*cyberspace/gi, '')
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove HTML entities
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    // Remove paragraph symbol specifically
    .replace(/&para;/g, '')
    // Remove other common problematic entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
    
  return cleanText;
}

/**
 * Get document from HTML string using JSDOM (Node.js only)
 * @param {string} html - HTML content
 * @param {string} url - URL for context
 * @returns {Document} JSDOM document
 */
async function getDocumentFromHtml(html, url) {
  try {
    // Use dynamic import to ensure jsdom is not bundled in browser builds
    const jsdomModule = await import('jsdom');
    const { JSDOM } = jsdomModule;
    
    const dom = new JSDOM(html, { url });
    return dom.window.document;
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error(`Failed to import jsdom in Node.js environment: ${error.message}. Make sure jsdom is installed as a dependency.`);
    }
    throw new Error('No suitable DOM implementation found for HTML parsing. This function requires either a browser environment with DOMParser or a Node.js environment with jsdom installed.');
  }
}

// --- Cleaning and Extraction Config (mirroring client) ---

const CLEANING_CONFIG = {
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
    '&para;': ''
  },
  boilerplatePhrases: [
    /(\s*\n\s*)?Sorry, your browser doesn't support embedded video\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?Your browser doesn't support embedded video\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?Browser doesn't support embedded video\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?Video not supported\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?Scroll For More(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Learn More About\s+\w+(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Made with.*cyberspace(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Cookie Policy(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Privacy Policy(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Terms of Service(\s*\n\s*)?/gi,
    /(\s*\n\s*)?All rights reserved(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Loading\.\.\.(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Please wait\.\.\.(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Click here to continue(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Enable JavaScript(\s*\n\s*)?/gi,
    /(\s*\n\s*)?JavaScript is required(\s*\n\s*)?/gi
  ],
  removeWithContent: [
    'script', 'style', 'noscript', 'iframe', 'embed', 'object', 'applet', 'video', 'audio', 'canvas', 'svg'
  ],
  removeTagsOnly: [
    'nav', 'header', 'footer', 'aside', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'mark', 'small', 'sub', 'sup'
  ],
  structuralTags: {
    'h1': '# ', 'h2': '## ', 'h3': '### ', 'h4': '#### ', 'h5': '##### ', 'h6': '###### ',
    'p': '\n', 'br': '\n', 'hr': '\n---\n', 'li': '- ', 'dt': '**', 'dd': ': ', 'blockquote': '> ', 'pre': '```\n', 'code': '`'
  },
  preserveWithSpacing: ['p', 'div', 'section', 'article', 'main'],
  codeTags: ['pre', 'code', 'samp', 'kbd', 'var'],
  normalizeChars: {
    '¶': '', '\u00A0': ' ', '\u200B': '', '\u200C': '', '\u200D': '', '\uFEFF': ''
  }
};

/**
 * Apply Unicode normalization to fix encoding issues
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeUnicode(text) {
  if (!text) return '';
  let normalized = text.normalize('NFC');
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

function normalizeWhitespace(text, preserveStructure = true) {
  if (!text) return '';

  if (preserveStructure) {
    // Preserve paragraph breaks and section spacing
    return text
      .replace(/¶/g, '')
      .replace(/&para;/gi, '')
      .replace(/[ \t]+/g, ' ')           // Collapse multiple spaces/tabs to single space
      .replace(/\n{4,}/g, '\n\n\n')      // Limit excessive newlines to max 3
      .replace(/\n{3}/g, '\n\n')         // Reduce 3 newlines to 2 (paragraph break)
      // Keep double newlines as-is for paragraph breaks
      .split('\n').map(line => line.trim()).join('\n')
      .trim();
  }

  // Original behavior for non-structured content
  return text
    .replace(/¶/g, '')
    .replace(/&para;/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .split('\n').map(line => line.trim()).join('\n')
    .trim();
}

function decodeHtmlEntities(text) {
  if (!text) return '';
  let decoded = text;
  Object.entries(CLEANING_CONFIG.htmlEntities).forEach(([entity, replacement]) => {
    decoded = decoded.replace(new RegExp(entity, 'gi'), replacement);
  });
  decoded = decoded.replace(/&[a-zA-Z0-9#]+;/g, ' ');
  return decoded;
}

function removeBoilerplate(text) {
  if (!text) return '';
  let cleaned = text;
  CLEANING_CONFIG.boilerplatePhrases.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  const repeatedPhrases = [
    "Sorry, your browser doesn't support embedded video",
    "Your browser doesn't support embedded video",
    "Browser doesn't support embedded video",
    "Video not supported",
    "Loading...",
    "Please wait..."
  ];
  repeatedPhrases.forEach(phrase => {
    const regex = new RegExp(`(\\s*\\n?\\s*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n?\\s*)+`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });
  return cleaned;
}

function removeVideoContent(text) {
  if (!text) return '';
  let cleaned = text;
  const videoPatterns = [
    /(\s*\n\s*)?(Sorry, )?your browser doesn'?t support embedded video\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?(Sorry, )?browser doesn'?t support embedded video\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?Video not supported\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?Video playback not supported\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?Unable to play video\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?\[Video Player\](\s*\n\s*)?/gi,
    /(\s*\n\s*)?\[Video\](\s*\n\s*)?/gi,
    /(\s*\n\s*)?\[Media Player\](\s*\n\s*)?/gi,
    /(\s*\n\s*)?Play(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Pause(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Stop(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Volume(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Fullscreen(\s*\n\s*)?/gi,
    /(\s*\n\s*)?Video format not supported\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?Codec not supported\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?Flash Player required\.?((\s*\n\s*)?)/gi,
    /(\s*\n\s*)?Adobe Flash required\.?((\s*\n\s*)?)/gi
  ];
  videoPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  const repeatedVideoErrors = /(\s*\n\s*)?(Sorry, )?(your )?browser doesn'?t support embedded video\.?((\s*\n\s*)?)/gi;
  cleaned = cleaned.replace(new RegExp(`(${repeatedVideoErrors.source})+`, 'gi'), '');
  return cleaned;
}

function removeMarkdownFormatting(text, preserveStructure = true) {
  if (!text) return '';
  let cleaned = text;

  if (preserveStructure) {
    // Only remove emphasis formatting, preserve headings, code blocks, and lists
    cleaned = cleaned.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
    cleaned = cleaned.replace(/\*\*_(.*?)_\*\*/g, '$1');
    cleaned = cleaned.replace(/_\*\*(.*?)\*\*_/g, '$1');
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
    cleaned = cleaned.replace(/__(.*?)__/g, '$1');
    cleaned = cleaned.replace(/\b\*(.*?)\*\b/g, '$1');
    cleaned = cleaned.replace(/\b_(.*?)_\b/g, '$1');
    cleaned = cleaned.replace(/~~(.*?)~~/g, '$1');
    // Remove link syntax but preserve text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
    // Keep headings, code blocks, and lists intact
    return cleaned;
  }

  // Original behavior if not preserving structure
  cleaned = cleaned.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
  cleaned = cleaned.replace(/\*\*_(.*?)_\*\*/g, '$1');
  cleaned = cleaned.replace(/_\*\*(.*?)\*\*_/g, '$1');
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/__(.*?)__/g, '$1');
  cleaned = cleaned.replace(/\b\*(.*?)\*\b/g, '$1');
  cleaned = cleaned.replace(/\b_(.*?)_\b/g, '$1');
  cleaned = cleaned.replace(/~~(.*?)~~/g, '$1');
  cleaned = cleaned.replace(/\b`([^`]+)`\b/g, '$1');
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  return cleaned;
}

function normalizeSpecialChars(text) {
  if (!text) return '';
  let normalized = text;
  Object.entries(CLEANING_CONFIG.normalizeChars).forEach(([char, replacement]) => {
    normalized = normalized.replace(new RegExp(char, 'g'), replacement);
  });
  return normalized;
}

/**
 * Fetch and clean content from a URL (Node.js version)
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
      let cleanText = html;
      cleanText = normalizeUnicode(cleanText);
      cleanText = removeBoilerplate(cleanText);
      cleanText = removeVideoContent(cleanText);
      cleanText = cleanHtmlWithDOM(cleanText);
      cleanText = decodeHtmlEntities(cleanText);
      cleanText = removeMarkdownFormatting(cleanText);
      cleanText = normalizeSpecialChars(cleanText);
      cleanText = normalizeWhitespace(cleanText);
      const wordCount = cleanText.split(/\s+/).filter(word => word.length > 0).length;
      return {
        url,
        title: generateTitleFromUrl(url),
        content: cleanText,
        wordCount,
        qualityScore: 1.0,
        source: 'plain-text',
        extractionMethod: 'plain-text',
        extractionReason: 'plain-text-file'
      };
    }

    // Parse HTML with JSDOM and extract content
    const doc = await getDocumentFromHtml(html, url);
    // Extract title
    let title = '';
    const titleElement = doc.querySelector('title, h1');
    if (titleElement) {
      title = titleElement.textContent.trim();
    }
    const genericTitle = /^(|untitled document|index|home|get(ting)? started)$/i;
    if (!title || genericTitle.test(title)) {
      title = generateTitleFromUrl(url);
    }
    // Extract content using extractContent (Defuddle with fallback)
    const extractionResult = extractContent(doc, url);
    let content = extractionResult.content;
    let wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    // Apply cleaning pipeline in logical order
    content = normalizeUnicode(content);
    content = removeBoilerplate(content);
    content = removeVideoContent(content);
    content = cleanHtmlWithDOM(content);
    content = decodeHtmlEntities(content);
    content = removeMarkdownFormatting(content);
    content = normalizeSpecialChars(content);
    content = normalizeWhitespace(content);
    wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    // Assess quality
    const qualityAssessment = assessContentQuality(content, {
      minLength: 30,
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
 * Batch fetch and clean multiple URLs with optimized processing
 * @param {string[]} urls - Array of URLs to process
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Results with summary
 */
export async function batchFetchAndClean(urls, options = {}) {
  const {
    concurrency = 5,
    qualityThreshold = 0.2,
    onProgress = () => {},
    onError = () => {},
    onQualityFilter = () => {}
  } = options;

  const results = [];
  const errors = [];
  const qualityFiltered = [];
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
    extractionMethods: {},
    extractionReasons: {},
    qualityScores: [],
    wordCounts: []
  };

  const processUrl = async (url) => {
    try {
      const result = await fetchAndClean(url, { qualityThreshold });
      metrics.successful++;
      metrics.extractionMethods[result.extractionMethod] = (metrics.extractionMethods[result.extractionMethod] || 0) + 1;
      metrics.extractionReasons[result.extractionReason] = (metrics.extractionReasons[result.extractionReason] || 0) + 1;
      metrics.qualityScores.push(result.qualityScore);
      metrics.wordCounts.push(result.wordCount);
      results.push(result);
      completed++;
      onProgress(completed, urls.length, url, result.qualityScore);
    } catch (error) {
      if (error.message.includes('Content quality too low')) {
        metrics.qualityFiltered++;
        const qualityScore = 0.1;
        qualityFiltered.push({ url, error: error.message, qualityScore });
        onQualityFilter(url, qualityScore, error.message);
      } else {
        metrics.failed++;
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
 * Enhanced parsing report with detailed quality metrics (mirroring client)
 * @param {Object} batchResults - Results from batchFetchAndClean
 * @returns {string} Formatted report
 */
export function generateParsingReport(batchResults) {
  const { metrics, results, errors, qualityFiltered } = batchResults;
  let report = '📊 PERMWEB LLM FUEL - ENHANCED PARSING REPORT\n';
  report += '='.repeat(60) + '\n\n';
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
  // Extraction Methods
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
    if (EXTRACTION_CONFIG.qualityIndicators.some(pattern => pattern.test(content))) {
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
  report += '='.repeat(60) + '\n';
  report += `Report generated: ${new Date().toISOString()}\n`;
  report += `Enhanced content extraction with semantic preservation\n`;
  return report;
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
      llmsContent += `Extraction Method: ${doc.extractionMethod || 'unknown'}\n`;
      llmsContent += `Extraction Reason: ${doc.extractionReason || 'unknown'}\n\n`;
    }

    // Document content
    if (doc.content) {
      llmsContent += doc.content + '\n';
    }
  }

  return llmsContent;
}

/**
 * Generate title from URL when no title is available
 * @param {string} url - URL to generate title from
 * @returns {string} Generated title
 */
function generateTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || 'Home';
    
    return lastPart
      .replace(/[-_]/g, ' ')
      .replace(/\.(html?|php|aspx?)$/i, '')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  } catch {
    return 'Untitled Page';
  }
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
 * Convert HTML to structured text while preserving formatting (Node/JSDOM version)
 * @param {string} html - HTML content
 * @returns {string} Structured text content
 */
function cleanHtmlWithDOM(html) {
  if (!html) return html;
  let JSDOM;
  try {
    JSDOM = require('jsdom').JSDOM;
  } catch {
    return html.replace(/<[^>]*>/g, '');
  }
  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    // Remove unwanted elements completely
    CLEANING_CONFIG.removeWithContent.forEach(tagName => {
      const elements = doc.querySelectorAll(tagName);
      elements.forEach(el => el.remove());
    });
    // Remove navigation and UI elements but keep their content
    CLEANING_CONFIG.removeTagsOnly.forEach(tagName => {
      const elements = doc.querySelectorAll(tagName);
      elements.forEach(el => {
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
    return html.replace(/<[^>]*>/g, '');
  }
}

/**
 * Recursively convert HTML elements to structured text (Node/JSDOM version)
 * @param {Element} element - DOM element to convert
 * @returns {string} Structured text
 */
function convertHtmlToStructuredText(element) {
  if (!element) return '';
  let result = '';

  // Handle text nodes
  if (element.nodeType === 3) { // Node.TEXT_NODE
    const text = (element.textContent || '').trim();
    return text ? text + ' ' : ''; // Add space after text nodes
  }

  // Handle element nodes
  if (element.nodeType === 1) { // Node.ELEMENT_NODE
    const tagName = element.tagName.toLowerCase();

    // Special handling for code blocks (use textContent to preserve formatting)
    if (tagName === 'pre') {
      const textContent = element.textContent.trim();
      if (textContent) {
        result += '```\n' + textContent + '\n```\n\n';
      }
      return result;
    }

    // Special handling for inline code (use textContent)
    if (tagName === 'code' && element.parentElement && element.parentElement.tagName.toLowerCase() === 'pre') {
      return element.textContent || '';
    }

    if (tagName === 'code') {
      const textContent = element.textContent.trim();
      if (textContent) {
        result += '`' + textContent + '` ';
      }
      return result;
    }

    // Handle line breaks and horizontal rules
    if (tagName === 'br') return '\n';
    if (tagName === 'hr') return '\n---\n\n';

    // Process all children recursively first
    let childrenText = '';
    for (const child of element.childNodes) {
      childrenText += convertHtmlToStructuredText(child);
    }

    // Trim and check if we have content
    childrenText = childrenText.trim();
    if (!childrenText) return '';

    // Apply structural formatting based on tag
    if (CLEANING_CONFIG.structuralTags[tagName]) {
      const prefix = CLEANING_CONFIG.structuralTags[tagName];
      switch (tagName) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          result += prefix + childrenText + '\n\n';
          break;
        case 'p':
          result += childrenText + '\n\n';
          break;
        case 'div':
          result += childrenText + '\n';
          break;
        case 'li':
          result += '- ' + childrenText + '\n';
          break;
        case 'blockquote':
          const lines = childrenText.split('\n');
          lines.forEach(line => {
            if (line.trim()) result += '> ' + line.trim() + '\n';
          });
          result += '\n';
          break;
        case 'dt':
          result += '**' + childrenText + '**\n';
          break;
        case 'dd':
          result += ': ' + childrenText + '\n';
          break;
        default:
          result += childrenText + ' ';
      }
    } else {
      // For non-structural tags, just return the children's text
      result += childrenText + ' ';
    }
  }

  return result;
}

/**
 * Configuration for content extraction strategies (mirroring client)
 */
const EXTRACTION_CONFIG = {
  contentSelectors: [
    'main', 'article', '[role="main"]', '.content', '.main-content', '#content', '#main', 'body'
  ],
  excludeSelectors: [
    'nav', 'header', 'footer', 'aside', '.sidebar', '.navigation', '.menu', '.breadcrumb', '.pagination', '.comments', '.advertisement', '.ads', '[class*="ad-"]', '[id*="ad-"]'
  ],
  minContentLength: 50,
  qualityIndicators: [
    /function\s*\(/i, /class\s+\w+/i, /api\//i, /http[s]?:\/\//i, /\.(js|ts|html|css|json|xml|md|txt)$/i, /database|server|client/i, /import\s+|export\s+/i, /const\s+|let\s+|var\s+/i
  ]
};

function extractContentSemantically(doc) {
  for (const selector of EXTRACTION_CONFIG.contentSelectors) {
    const element = doc.querySelector(selector);
    if (element && element.textContent.trim().length > EXTRACTION_CONFIG.minContentLength) {
      EXTRACTION_CONFIG.excludeSelectors.forEach(excludeSelector => {
        const excludedElements = element.querySelectorAll(excludeSelector);
        excludedElements.forEach(el => el.remove());
      });
      const content = element.textContent.trim();
      if (content.length > EXTRACTION_CONFIG.minContentLength) {
        const quality = assessContentQuality(content);
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

function extractContentWithDefuddle(doc, url) {
  try {
    const defuddle = new Defuddle(doc, { markdown: true, debug: false, url });
    const result = defuddle.parse();
    if (result && result.content) {
      const content = result.content.trim();
      const containsHtml = /<[^>]+>/.test(content);
      if (containsHtml) {
        try {
          const JSDOM = require('jsdom').JSDOM;
          const htmlDoc = new JSDOM(content).window.document;
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
      if (content.length > EXTRACTION_CONFIG.minContentLength) {
        const quality = assessContentQuality(content);
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
 * Extracts main content using Defuddle with semantic DOM enhancement (Node version)
 * @param {string|Document} html - HTML string or Document to extract from
 * @param {string} url - URL for context (optional)
 * @returns {Object} Object with content and metadata about extraction method
 */
function extractContent(html, url = '') {
  let doc = null;
  if (typeof html === 'string') {
    try {
      const JSDOM = require('jsdom').JSDOM;
      doc = new JSDOM(html).window.document;
    } catch (error) {
      return extractContentFallback(html);
    }
  } else if (html && typeof html === 'object' && html.nodeType === 9) {
    doc = html;
  } else {
    return extractContentFallback(html);
  }
  const defuddleResult = extractContentWithDefuddle(doc, url);
  if (defuddleResult && defuddleResult.content) {
    return defuddleResult;
  }
  const semanticResult = extractContentSemantically(doc);
  if (semanticResult && semanticResult.content) {
    return semanticResult;
  }
  return extractContentFallback(doc);
}