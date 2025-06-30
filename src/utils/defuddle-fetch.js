import Defuddle from 'defuddle';
import { enhancedDefuddleExtraction } from './content-enhancer.js';
import { assessContentQuality } from './quality-scorer.js';
import { optimizedBatchExtraction } from './batch-processor.js';

/**
 * Strip HTML tags and decode HTML entities from text content
 * Works in both browser and Node.js environments
 * Preserves only structurally meaningful formatting for LLMs
 * @param {string} text - Text that may contain HTML
 * @returns {string} Clean text with structural formatting preserved
 */
function stripHTML(text) {
  if (!text) return '';

  let cleanText = text;

  // Environment-agnostic HTML stripping
  if (typeof document !== 'undefined' && document.createElement) {
    // Browser environment - use DOM for initial parsing
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    cleanText = tempDiv.textContent || tempDiv.innerText || '';
  } else {
    // Node.js environment - manual processing
    cleanText = text;
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



  // Don't touch underscores - preserve them completely

  // Clean up whitespace while preserving code block formatting
  let segments = cleanText.split(/(\n```[\s\S]*?\n```\n?)/g);
  segments = segments.map(segment => {
    if (/^\n```[\s\S]*?\n```\n?$/.test(segment)) {
      return segment;
    } else {
      return segment
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
    }
  });
  cleanText = segments.join('');

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