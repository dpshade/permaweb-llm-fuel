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
    qualityThreshold = 0.3,
    useEnhancedExtraction = true,
    contentFilters = {},
    contentSelectors = []
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

    // Parse HTML with JSDOM
    const doc = await getDocumentFromHtml(html, url);

    // Extract title
    let title = '';
    const titleElement = doc.querySelector('title, h1');
    if (titleElement) {
      title = titleElement.textContent.trim();
    }
    if (!title) {
      title = generateTitleFromUrl(url);
    }

    // Extract content using enhanced extraction or Defuddle
    let content = '';
    let wordCount = 0;
    let qualityScore = 0;

    if (useEnhancedExtraction) {
      console.log(`[defuddle-fetch-server] Attempting enhanced extraction for ${url}`);
      try {
        const enhancedResult = await enhancedDefuddleExtraction(html, {
          url,
          contentFilters: {
            removeScripts: true,
            removeStyles: true,
            removeComments: true,
            removeEmptyElements: true,
            minWordCount: 50,
            maxCodeBlockLength: 1000,
            ...contentFilters
          }
        });

        if (enhancedResult && enhancedResult.content) {
          console.log(`[defuddle-fetch-server] Enhanced extraction successful for ${url}`);
          // Clean the content returned by enhanced extraction to remove any remaining HTML
          content = stripHTML(enhancedResult.content);
          wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
          
          // Assess quality
          const qualityAssessment = assessContentQuality(content, {
            minLength: 100,
            requireTechnical: false
          });
          qualityScore = qualityAssessment.overallScore;
        }
      } catch (error) {
        console.warn(`Enhanced extraction failed for ${url}:`, error.message);
      }
    }

    // Fallback to Defuddle if enhanced extraction failed or produced poor results
    if (!content || wordCount < 100) {
      console.log(`[defuddle-fetch-server] Attempting Defuddle extraction for ${url}`);
      try {
        const defuddle = new Defuddle(doc, {
          markdown: true, // Convert to Markdown for cleaner text output
          debug: false
        });

        const defuddleResult = defuddle.parse();
        if (defuddleResult && defuddleResult.content) {
          console.log(`[defuddle-fetch-server] Defuddle extraction successful for ${url}`);
          content = defuddleResult.content;
          wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
          
          // Assess quality
          const qualityAssessment = assessContentQuality(content, {
            minLength: 100,
            requireTechnical: false
          });
          qualityScore = qualityAssessment.overallScore;
        }
      } catch (error) {
        console.warn(`Defuddle extraction failed for ${url}:`, error.message);
      }
    }

    // Final fallback to manual extraction
    if (!content || wordCount < 50) {
      // Use selectors from options or fallback
      let selectors = contentSelectors || ['main', 'article', '.content', '.main', '[role="main"]'];
      if (typeof selectors === 'string') selectors = selectors.split(',').map(s => s.trim());
      
      console.log(`[defuddle-fetch-server] Using selectors for ${url}:`, selectors);
      
      let mainElement = null;
      for (const selector of selectors) {
        mainElement = doc.querySelector(selector);
        if (mainElement) {
          console.log(`[defuddle-fetch-server] Found content with selector: "${selector}"`);
          break;
        }
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
        minLength: 100,
        requireTechnical: false
      });
      qualityScore = qualityAssessment.overallScore;
    }

    // Apply content filters
    if (contentFilters && Object.keys(contentFilters).length > 0) {
      content = applyContentFilters(content, { contentFilters });
      wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    }

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
 * Batch fetch and clean multiple URLs with optimized processing
 * @param {string[]} urls - Array of URLs to process
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Results with summary
 */
export async function batchFetchAndClean(urls, options = {}) {
  const {
    concurrency = 5,
    qualityThreshold = 0.3,
    onProgress = () => {},
    onError = () => {},
    onQualityFilter = () => {},
    useOptimizedBatch = true
  } = options;

  if (useOptimizedBatch) {
    return optimizedBatchExtraction(urls, fetchAndClean, {
      concurrency,
      qualityThreshold,
      onProgress,
      onError,
      onQualityFilter
    });
  }

  // Fallback to simple batch processing
  const results = [];
  const errors = [];
  let completed = 0;

  const processUrl = async (url) => {
    try {
      const result = await fetchAndClean(url, { qualityThreshold });
      results.push(result);
      completed++;
      onProgress(completed, urls.length, url, result.qualityScore);
    } catch (error) {
      errors.push({ url, error: error.message });
      completed++;
      onProgress(completed, urls.length, url, 0);
      onError(url, error);
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
    summary: {
      total: urls.length,
      successful: results.length,
      failed: errors.length
    }
  };
}

/**
 * Generate llms.txt format from cleaned documents
 * @param {Array} documents - Array of cleaned document objects
 * @param {Object} options - Generation options
 * @returns {string} Formatted llms.txt content
 */
export function generateLLMsTxt(documents, options = {}) {
  const {
    includeMetadata = true,
    includeQualityScores = false,
    sortByQuality = true,
    maxDocuments = null
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
      llmsContent += `**Source:** ${doc.url}\n`;
      llmsContent += `**Words:** ${doc.wordCount || 0}\n`;
      if (includeQualityScores && doc.qualityScore !== undefined) {
        llmsContent += `**Quality Score:** ${doc.qualityScore.toFixed(3)}\n`;
      }
      llmsContent += `**Extraction Method:** ${doc.source || 'unknown'}\n\n`;
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