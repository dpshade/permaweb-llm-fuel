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

/**
 * Strip HTML tags and decode HTML entities from text content
 * Browser environment only - uses DOM for parsing
 * Preserves only structurally meaningful formatting for LLMs
 * @param {string} text - Text that may contain HTML
 * @returns {string} Clean text with structural formatting preserved
 */
function stripHTML(text) {
  if (!text) return '';

  let cleanText = text;

  // Browser environment - use DOM for initial parsing
  if (typeof document !== 'undefined' && document.createElement) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    cleanText = tempDiv.textContent || tempDiv.innerText || '';
  }

  // Remove harmful script/style tags and their content FIRST
  cleanText = cleanText
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Preserve code blocks with proper formatting
  cleanText = cleanText.replace(/<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (match, code) => {
    code = code.replace(/^[\r\n]+|[\r\n]+$/g, '');
    return '\n```\n' + code + '\n```\n';
  });

  // Strip Markdown formatting FIRST (before HTML conversion) while preserving code blocks
  let markdownSegments = cleanText.split(/(\n```[\s\S]*?\n```\n?)/g);
  markdownSegments = markdownSegments.map((segment, idx) => {
    if (/^\n```[\s\S]*?\n```\n?$/.test(segment)) {
      // This is a code block, return as-is without Markdown removal
      return segment;
    } else {
      // For the first segment, preserve the first line's leading # (title), strip from all others
      if (idx === 0) {
        const lines = segment.split('\n');
        // Preserve leading # for the first line only
        lines[0] = lines[0].replace(/^\s*#\s+/, '# ');
        for (let i = 1; i < lines.length; i++) {
          lines[i] = lines[i]
            // Remove bold formatting - only when double asterisks/underscores are used for Markdown formatting
            .replace(/(?<=\s|^)\*\*([^*]+)\*\*(?=\s|$)/g, '$1')
            .replace(/(?<=\s|^)__([^_]+)__(?=\s|$)/g, '$1')
            // Remove italic formatting - only when underscores are used for Markdown formatting
            .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
            .replace(/(?<=\s|^)_([^_]+)_(?=\s|$)/g, '$1')
            // Remove inline code formatting
            .replace(/`([^`]+)`/g, '$1')
            // Remove strikethrough
            .replace(/~~([^~]+)~~/g, '$1')
            // Remove list markers
            .replace(/^\s*[-*+]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            // Remove blockquotes
            .replace(/^\s*>\s+/gm, '')
            // Remove links (keep link text)
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Remove images (keep alt text)
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            // Remove headers (but preserve the text)
            .replace(/^\s*#{1,6}\s+/, '');
        }
        return lines.join('\n');
      }
      // For all other segments, strip all Markdown formatting
      return segment
        // Remove bold formatting - only when double asterisks/underscores are used for Markdown formatting
        .replace(/(?<=\s|^)\*\*([^*]+)\*\*(?=\s|$)/g, '$1')
        .replace(/(?<=\s|^)__([^_]+)__(?=\s|$)/g, '$1')
        // Remove italic formatting - only when underscores are used for Markdown formatting
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
        .replace(/(?<=\s|^)_([^_]+)_(?=\s|$)/g, '$1')
        // Remove inline code formatting
        .replace(/`([^`]+)`/g, '$1')
        // Remove strikethrough
        .replace(/~~([^~]+)~~/g, '$1')
        // Remove list markers
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        // Remove blockquotes
        .replace(/^\s*>\s+/gm, '')
        // Remove links (keep link text)
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove images (keep alt text)
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        // Remove headers (but preserve the text)
        .replace(/^\s*#{1,6}\s+/, '');
    }
  });
  cleanText = markdownSegments.join('');

  // Convert structural HTML to markdown BEFORE removing tags
  cleanText = cleanText
    .replace(/<code\b[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<h([1-6])\b[^>]*>(.*?)<\/h[1-6]>/gi, (match, level, text) => {
      const hashes = '#'.repeat(parseInt(level));
      return `\n${hashes} ${text}\n`;
    })
    .replace(/<li\b[^>]*>(.*?)<\/li>/gi, '• $1\n')
    .replace(/<ul\b[^>]*>|<\/ul>/gi, '')
    .replace(/<ol\b[^>]*>|<\/ol>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p\b[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<blockquote\b[^>]*>/gi, '\n> ')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    // Remove <strong> and <em> tags but preserve their content
    .replace(/<strong\b[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<em\b[^>]*>(.*?)<\/em>/gi, '$1');

  // Remove ALL remaining HTML tags (including visual formatting)
  cleanText = cleanText.replace(/<[^>]*>/g, '');

  // Decode HTML entities AFTER tag removal
  cleanText = cleanText
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
    .replace(/&#(\d+);/g, (match, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch (e) {
        return ' ';
      }
    })
    .replace(/&#x([0-9A-F]+);/gi, (match, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch (e) {
        return ' ';
      }
    })
    .replace(/&[a-zA-Z0-9#]+;/g, ' ');

  // Remove malicious JavaScript patterns
  cleanText = cleanText
    .replace(/javascript:/gi, '')
    .replace(/alert\s*\(/gi, '')
    .replace(/document\./gi, '')
    .replace(/window\./gi, '')
    .replace(/eval\s*\(/gi, '')
    .replace(/Function\s*\(/gi, '')
    .replace(/setTimeout\s*\(/gi, '')
    .replace(/setInterval\s*\(/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/XSS/gi, '')
    .replace(/innerHTML/gi, '')
    .replace(/attempt/gi, '')
    .replace(/hacked/gi, '')
    .replace(/malicious/gi, '');

  // Remove CSS patterns more aggressively, but preserve code blocks
  let cssSegments = cleanText.split(/(\n```[\s\S]*?\n```\n?)/g);
  cssSegments = cssSegments.map(segment => {
    if (/^\n```[\s\S]*?\n```\n?$/.test(segment)) {
      // This is a code block, return as-is without CSS removal
      return segment;
    } else {
      // Apply CSS removal only outside code blocks
      return segment
        .replace(/\{[^}]*\}/g, ' ')
        .replace(/[a-zA-Z-]+\s*:\s*[^;]+;/g, ' ')
        .replace(/\b(?:display|color|background|font|margin|padding|border|width|height)\s*:\s*[^;]+/gi, '')
        .replace(/url\s*\([^)]+\)/gi, '');
    }
  });
  cleanText = cssSegments.join('');

  // Final cleanup
  cleanText = cleanText
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive line breaks
    .replace(/^\s+|\s+$/g, '') // Trim whitespace
    .replace(/\s+/g, ' '); // Normalize whitespace

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
 * Simple content quality assessment (client-side version)
 * @param {string} content - Content to assess
 * @param {Object} options - Assessment options
 * @returns {Object} Quality assessment
 */
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

  const processUrl = async (url) => {
    try {
      const result = await fetchAndClean(url, { qualityThreshold });
      results.push(result);
      completed++;
      onProgress(completed, urls.length, url, result.qualityScore);
    } catch (error) {
      // Check if this is a quality threshold error (simplified check)
      if (error.message.includes('Content quality too low')) {
        // Simplified quality score extraction
        const qualityScore = 0.1; // Default low score for filtered content
        
        qualityFiltered.push({ 
          url, 
          error: error.message,
          qualityScore: qualityScore
        });
        onQualityFilter(url, qualityScore, error.message);
      } else {
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

  return {
    results,
    errors,
    qualityFiltered,
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
    qualityThreshold = 0.2
  } = options;

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

    // Extract content using manual selectors
    let content = '';
    let wordCount = 0;
    let qualityScore = 0;

    // Try main content selectors
    const mainSelectors = ['main', 'article', '.content', '.main', '[role="main"]'];
    let mainElement = null;

    for (const selector of mainSelectors) {
      mainElement = doc.querySelector(selector);
      if (mainElement) break;
    }

    if (mainElement) {
      content = mainElement.textContent || '';
    } else {
      // Last resort: use body content
      const body = doc.querySelector('body');
      content = body ? body.textContent || '' : '';
    }

    content = stripHTML(content);
    wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    
    // Assess quality
    const qualityAssessment = assessContentQuality(content, {
      minLength: 30, // Further reduced from 50 to 30
      requireTechnical: false
    });
    qualityScore = qualityAssessment.overallScore;

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
      source: 'html'
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

    // Document header
    llmsContent += `# ${doc.title || 'Untitled Document'}\n\n`;
    
    if (includeMetadata) {
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