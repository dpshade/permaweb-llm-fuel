import Defuddle from 'defuddle';
import { enhancedDefuddleExtraction } from './content-enhancer.js';
import { assessContentQuality } from './quality-scorer.js';
import { optimizedBatchExtraction } from './batch-processor.js';

/**
 * Strip HTML tags and decode HTML entities from text content
 * Works in both browser and Node.js environments
 * @param {string} text - Text that may contain HTML
 * @returns {string} Clean text without HTML
 */
function stripHTML(text) {
  if (!text) return '';

  let cleanText = text;

  // Environment-agnostic HTML stripping
  if (typeof document !== 'undefined' && document.createElement) {
    // Browser environment - use DOM
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    cleanText = tempDiv.textContent || tempDiv.innerText || '';
  } else {
    // Node.js environment - use regex-based stripping
    cleanText = text
      // Remove HTML tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]*>/g, '')
      // Handle self-closing tags
      .replace(/<[^>]*\/>/g, '');
  }

  // Universal HTML entity decoding and cleanup
  cleanText = cleanText
    // Common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    // Numeric HTML entities
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
    // Clean any remaining HTML-like patterns
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    // Strip Markdown formatting
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** -> bold
    .replace(/__([^_]+)__/g, '$1')      // __bold__ -> bold
    .replace(/\*([^*]+)\*/g, '$1')      // *italic* -> italic
    .replace(/_([^_]+)_/g, '$1')        // _italic_ -> italic
    .replace(/`([^`]+)`/g, '$1')        // `code` -> code
    .replace(/~~([^~]+)~~/g, '$1')      // ~~strikethrough~~ -> strikethrough
    .replace(/^#{1,6}\s+/gm, '')        // # Headers -> Headers
    .replace(/^\s*[-*+]\s+/gm, '')      // - List items -> List items
    .replace(/^\s*\d+\.\s+/gm, '')      // 1. Numbered lists -> Numbered lists
    .replace(/^\s*>\s+/gm, '')          // > Blockquotes -> Blockquotes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [link text](url) -> link text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // ![alt text](image) -> alt text
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  return cleanText;
}

/**
 * Fetches a URL and extracts clean content using enhanced Defuddle processing
 * @param {string} url - The URL to fetch and clean
 * @param {Object} options - Processing options
 * @returns {Promise<{title: string, content: string, url: string, wordCount: number}>}
 */
export async function fetchAndClean(url, options = {}) {
  const {
    useEnhancedExtraction = true,
    assessQuality = true,
    minQualityScore = 0.0,
    signal = null
  } = options;

  try {
    // Fetch the HTML content
    const response = await fetch(url, {
      mode: 'cors',
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Parse HTML into a document
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let cleanContent;
    let result = {};

    if (useEnhancedExtraction) {
      // Use enhanced extraction with LLM optimizations
      const rawContent = enhancedDefuddleExtraction(html, {
        defuddleInstance: Defuddle,
        url: url,
        removeExactSelectors: true,
        removePartialSelectors: true,
        markdown: true,
        debug: false
      });

      // CRITICAL: Strip HTML from enhanced extraction output
      cleanContent = stripHTML(rawContent);

      // Extract metadata using standard Defuddle
      const defuddle = new Defuddle(doc, {
        debug: false,
        markdown: false,
        url: url
      });
      result = defuddle.parse();
    } else {
      // Use standard Defuddle extraction
      const defuddle = new Defuddle(doc, {
        debug: false,
        markdown: false,
        url: url,
        removeExactSelectors: true,
        removePartialSelectors: true
      });

      result = defuddle.parse();
      cleanContent = stripHTML(result.content || '');
    }

    // Strip any remaining HTML from metadata fields
    const cleanTitle = stripHTML(result.title || 'Untitled');
    const cleanAuthor = stripHTML(result.author || '');
    const cleanDescription = stripHTML(result.description || '');

    // Basic content validation
    if (cleanContent.split(/\s+/).length < 50) {
      throw new Error(`Content too short: ${cleanContent.split(/\s+/).length} words`);
    }

    // Check for 404 indicators in content
    if (cleanContent && cleanContent.toLowerCase().includes('404') &&
      cleanContent.toLowerCase().includes('not found')) {
      throw new Error('404 page detected');
    }

    const extractedContent = {
      title: cleanTitle,
      content: cleanContent,
      url: url,
      wordCount: cleanContent.split(/\s+/).filter(word => word.length > 0).length,
      author: cleanAuthor,
      published: result.published || '',
      description: cleanDescription,
      domain: result.domain || new URL(url).hostname,
      parseTime: result.parseTime || 0
    };

    // Assess content quality if requested
    if (assessQuality) {
      const qualityAssessment = assessContentQuality(cleanContent, {
        minLength: 100,
        requireTechnical: false
      });

      extractedContent.qualityScore = qualityAssessment.overallScore;
      extractedContent.qualityLevel = qualityAssessment.qualityLevel;
      extractedContent.qualityDetails = qualityAssessment.details;
      extractedContent.qualityReason = qualityAssessment.reason;

      // Filter by quality threshold
      if (qualityAssessment.overallScore < minQualityScore) {
        throw new Error(`Content quality ${qualityAssessment.overallScore.toFixed(2)} below threshold ${minQualityScore}`);
      }
    }

    return extractedContent;

  } catch (error) {
    console.error(`Failed to fetch and clean ${url}:`, error);

    // Fallback to simple content extraction if enhanced extraction fails
    try {
      const response = await fetch(url, { signal });
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const title = stripHTML(doc.querySelector('title')?.textContent || 'Untitled');
      const content = stripHTML(doc.body?.textContent || '');

      const fallbackResult = {
        title: title,
        content: content,
        url: url,
        wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
        author: '',
        published: '',
        description: '',
        domain: new URL(url).hostname,
        parseTime: 0
      };

      if (assessQuality) {
        const qualityAssessment = assessContentQuality(content);
        fallbackResult.qualityScore = qualityAssessment.overallScore;
        fallbackResult.qualityLevel = qualityAssessment.qualityLevel;
        fallbackResult.qualityReason = 'Fallback extraction';
      }

      return fallbackResult;

    } catch (fallbackError) {
      return {
        title: 'Error loading page',
        content: `Failed to load content from ${url}: ${error.message}`,
        url: url,
        wordCount: 0,
        author: '',
        published: '',
        description: '',
        domain: '',
        parseTime: 0,
        qualityScore: 0,
        qualityLevel: 'error',
        qualityReason: error.message
      };
    }
  }
}

/**
 * Batch fetch and clean multiple URLs with optimized parallel processing
 * @param {string[]} urls - Array of URLs to process
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results with metadata
 */
export async function batchFetchAndClean(urls, options = {}) {
  const {
    onProgress = () => { },
    onError = () => { },
    onQualityFilter = () => { },
    concurrency = 5,
    qualityThreshold = 0.3,
    useOptimizedBatch = true,
    includeFailures = false,
    ...fetchOptions
  } = options;

  if (useOptimizedBatch) {
    // Use the optimized batch processor
    return optimizedBatchExtraction(urls, fetchAndClean, {
      concurrency,
      qualityThreshold,
      onProgress,
      onError,
      onQualityFilter,
      includeFailures,
      ...fetchOptions
    });
  }

  // Fallback to sequential processing
  const results = [];
  const total = urls.length;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    onProgress(i + 1, total, url);

    try {
      const result = await fetchAndClean(url, fetchOptions);

      // Apply quality threshold if specified
      if (!qualityThreshold || (result.qualityScore || 1) >= qualityThreshold) {
        results.push(result);
      } else {
        onQualityFilter(url, result.qualityScore, result.qualityReason);
      }

      // Small delay to avoid overwhelming the server
      if (i < urls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Batch processing failed for ${url}:`, error);
      onError(url, error);

      if (includeFailures) {
        results.push({
          title: 'Processing Error',
          content: `Failed to process ${url}`,
          url: url,
          wordCount: 0,
          author: '',
          published: '',
          description: '',
          domain: '',
          parseTime: 0,
          qualityScore: 0,
          qualityLevel: 'error',
          qualityReason: error.message
        });
      }
    }
  }

  return {
    results,
    summary: {
      total: urls.length,
      successful: results.length,
      failed: urls.length - results.length
    }
  };
}

/**
 * Generate llms.txt content from cleaned documents
 * @param {Array|Object} documents - Array of cleaned document objects or batch result object
 * @param {Object} options - Generation options
 * @returns {string} Formatted llms.txt content
 */
export function generateLLMsTxt(documents, options = {}) {
  const {
    includeMetadata = true,
    includeToc = true,
    customHeader = '',
    separator = '\n\n---\n\n'
  } = options;

  // Handle both array input and batch result object
  let documentsArray;
  if (Array.isArray(documents)) {
    documentsArray = documents;
  } else if (documents && documents.results && Array.isArray(documents.results)) {
    documentsArray = documents.results;
  } else if (documents && documents.results && Array.isArray(documents.results.results)) {
    // Handle nested results from optimized batch processing
    documentsArray = documents.results.results;
  } else {
    console.error('Invalid documents parameter:', documents);
    documentsArray = [];
  }

  let content = '';

  // Add custom header if provided
  if (customHeader) {
    content += `${customHeader}\n\n`;
  }

  // Add metadata section
  if (includeMetadata) {
    const totalWords = documentsArray.reduce((sum, doc) => sum + (doc.wordCount || 0), 0);
    const generatedAt = new Date().toISOString();
    const totalParseTime = documentsArray.reduce((sum, doc) => sum + (doc.parseTime || 0), 0);

    content += `# Permaweb Documentation Collection\n\n`;
    content += `Generated: ${generatedAt}\n`;
    content += `Total Documents: ${documentsArray.length}\n`;
    content += `Total Words: ${totalWords.toLocaleString()}\n`;
    content += `Processing Time: ${totalParseTime}ms\n`;
    content += `Source: Permaweb LLMs Builder\n`;
    content += `Extracted with: Defuddle v0.6.4\n\n`;
  }

  // Add table of contents
  if (includeToc && documentsArray.length > 1) {
    content += `## Table of Contents\n\n`;
    documentsArray.forEach((doc, index) => {
      const cleanTitle = stripHTML(doc.title || 'Untitled');
      const anchor = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      content += `${index + 1}. [${cleanTitle}](#${anchor})\n`;
    });
    content += `\n`;
  }

  // Add documents
  documentsArray.forEach((doc, index) => {
    if (index > 0) {
      content += separator;
    }

    // CRITICAL: Sanitize all content before adding to LLM output
    const cleanTitle = stripHTML(doc.title || 'Untitled');
    const cleanAuthor = stripHTML(doc.author || '');
    const cleanDescription = stripHTML(doc.description || '');
    const cleanContent = stripHTML(doc.content || '');

    content += `# ${cleanTitle}\n\n`;

    if (includeMetadata) {
      content += `Source: ${doc.url}\n`;
      if (cleanAuthor) content += `Author: ${cleanAuthor}\n`;
      if (doc.published) content += `Published: ${doc.published}\n`;
      if (cleanDescription) content += `Description: ${cleanDescription}\n`;
      if (doc.domain) content += `Domain: ${doc.domain}\n`;
      content += `Word Count: ${doc.wordCount.toLocaleString()}\n`;
      if (doc.parseTime > 0) content += `Parse Time: ${doc.parseTime}ms\n`;
      content += `\n`;
    }

    content += cleanContent;

    if (!cleanContent.endsWith('\n')) {
      content += '\n';
    }
  });

  return content;
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