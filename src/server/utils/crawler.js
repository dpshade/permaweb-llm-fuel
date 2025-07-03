/**
 * SERVER-ONLY: Web crawler for Permaweb documentation sites
 * 
 * This file contains Node.js-specific code and should NEVER be imported in client code.
 * It uses fs, process, jsdom, and other Node.js modules that are not available in browsers.
 * 
 * For client-side content fetching, use @client/utils/defuddle-fetch-client.js instead.
 * 
 * @fileoverview Server-side crawler with rate limiting and content extraction
 */

/**
 * Simple browser-based crawler for Permaweb documentation sites
 * Discovers pages by following links with basic sibling discovery
 */

// Remove static import of JSDOM - will use dynamic import in Node.js only
import { promises as fs } from 'fs';
import { resolve } from 'path';
import Defuddle from 'defuddle';

// Color utilities for clean console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}INFO${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}SUCCESS${colors.reset} ${msg}`),
  warn: (msg) => console.warn(`${colors.yellow}WARN${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}ERROR${colors.reset} ${msg}`),
  discovery: (msg) => console.log(`${colors.magenta}DISCOVERY${colors.reset} ${msg}`),
  debug: (msg) => {
    if (process.env.DEBUG_CRAWL || process.argv.includes('--debug')) {
      console.log(`${colors.cyan}DEBUG${colors.reset} ${msg}`);
    }
  }
};

// Cache for loaded configuration
let crawlConfigs = null;

/**
 * Rate limiter for respectful crawling
 */
class RateLimiter {
  constructor(requestsPerSecond = 2, burstSize = 5) {
    this.requestsPerSecond = requestsPerSecond;
    this.burstSize = burstSize;
    this.tokens = burstSize;
    this.lastRefill = Date.now();
  }

  async acquire() {
    return new Promise((resolve) => {
      const now = Date.now();
      const timePassed = (now - this.lastRefill) / 1000;
      
      // Refill tokens based on time passed
      this.tokens = Math.min(
        this.burstSize,
        this.tokens + timePassed * this.requestsPerSecond
      );
      this.lastRefill = now;

      if (this.tokens >= 1) {
        this.tokens -= 1;
        resolve();
      } else {
        // Calculate wait time for next token
        const waitTime = (1 - this.tokens) / this.requestsPerSecond * 1000;
        setTimeout(() => {
          this.tokens = Math.max(0, this.tokens - 1);
          resolve();
        }, waitTime);
      }
    });
  }
}

// Global rate limiter - 2 requests per second with burst of 5
const rateLimiter = new RateLimiter(2, 5);



/**
 * Load existing docs index to avoid re-crawling pages
 */
async function loadExistingIndex() {
  try {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    
    // Load from public/docs-index.json (publicly accessible in Astro)
    const indexPath = resolve(process.cwd(), 'public/docs-index.json');
    
    let indexJson = null;
    
    try {
      indexJson = readFileSync(indexPath, 'utf8');
    } catch (error) {
      throw new Error('No existing index found');
    }
    
    const indexData = JSON.parse(indexJson);
    
    // Create a Set of all existing URLs for fast lookup
    const existingUrls = new Set();
    for (const siteData of Object.values(indexData.sites || {})) {
      for (const page of siteData.pages || []) {
        existingUrls.add(page.url);
      }
    }
    
    log.info(`Loaded existing index from: ${indexPath}`);
    
    return { indexData, existingUrls };
  } catch (error) {
    // If no existing index, return empty data
    return { 
      indexData: { generated: new Date().toISOString(), sites: {} }, 
      existingUrls: new Set() 
    };
  }
}

/**
 * Load crawl configuration from JSON file
 */
async function loadCrawlConfigs() {
  if (crawlConfigs) {
    return crawlConfigs;
  }

  try {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const configPath = resolve(process.cwd(), 'public/crawl-config.json');
    const configJson = readFileSync(configPath, 'utf8');
    const rawConfigs = JSON.parse(configJson);
    
    // Convert string regex patterns back to RegExp objects
    crawlConfigs = {};
    for (const [key, config] of Object.entries(rawConfigs)) {
      crawlConfigs[key] = {
        ...config,
        excludePatterns: config.excludePatterns.map(pattern => {
          const match = pattern.match(/^\/(.+)\/([gimuy]*)$/);
          if (match) {
            return new RegExp(match[1], match[2]);
          }
          return new RegExp(pattern);
        })
      };
    }

    return crawlConfigs;
  } catch (error) {
    log.error('Failed to load crawl configuration');
    crawlConfigs = {};
    return crawlConfigs;
  }
}

/**
 * Fetch page with rate limiting
 */
async function fetchPage(url, options = {}) {
  await rateLimiter.acquire();
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMFuel/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
      ...options
    });

    if (!response.ok) {
      if (response.status === 404) {
        log.warn(`404 page detected: ${url}`);
      }
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const content = await response.text();

    // Handle plain text files
    if (contentType.includes('text/plain') || url.endsWith('.txt')) {
      return {
        isPlainText: true,
        textContent: content,
        url: url
      };
    }

    // Handle HTML content - use dynamic import for JSDOM in Node.js
    if (typeof window === 'undefined') {
      // Node.js environment
      const { JSDOM } = await import('jsdom');
      const dom = new JSDOM(content, { url });
      return dom.window.document;
    } else {
      // Browser environment - use DOMParser
      const parser = new DOMParser();
      return parser.parseFromString(content, 'text/html');
    }
  } catch (error) {
    log.error(`Fetch failed for ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Extract all links from a page with simple filtering
 */
function extractLinks(doc, currentPageUrl, baseUrl, config) {
  const links = [];
  const allLinks = doc.querySelectorAll('a[href]');
  

  
  for (const link of allLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;
    
    // Use current page URL as base for resolving relative paths
    const resolvedUrl = resolveUrl(href, currentPageUrl);
    

    
    if (isValidUrl(resolvedUrl, baseUrl, config)) {
      links.push(resolvedUrl);
    }
  }
  

  
  return [...new Set(links)]; // Remove duplicates
}

/**
 * Resolve relative URLs to absolute URLs
 */
function resolveUrl(href, baseUrl) {
  try {
    const resolved = new URL(href, baseUrl).href;
    return resolved;
  } catch (error) {
    return null;
  }
}

/**
 * Check if URL is valid for crawling
 */
function isValidUrl(url, baseUrl, config) {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    const baseUrlObj = new URL(baseUrl);
    

    
    // Must be same domain
    if (urlObj.hostname !== baseUrlObj.hostname) {
      return false;
    }
    
    // Skip URLs with hash fragments (anchor links)
    if (urlObj.hash) return false;
    
    // Check exclude patterns
    for (const pattern of config.excludePatterns) {
      if (pattern.test(url)) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Detect if a page is a 404 error page based on content
 */
function is404Page(doc, title, content) {
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
  const contentLower = content.toLowerCase();
  const titleLower = title.toLowerCase();
  
  // Check title for 404 indicators
  if (titleLower.includes('404') || 
      titleLower.includes('not found') || 
      titleLower.includes('page not found') ||
      titleLower.includes('file not found')) {
    return true;
  }
  
  // Check content for 404 indicators with word count limits
  const has404Indicators = contentLower.includes('404') && 
    (contentLower.includes('not found') || 
     contentLower.includes('page not found') ||
     contentLower.includes('file not found'));
  
  if (has404Indicators) {
    // If page has 404 indicators, it must also meet word count requirements
    // to be considered a 404 page (not too long, not too short)
    if (wordCount >= 20 && wordCount <= 200) {
      return true;
    }
  }
  
  // Check for very short content that might be a 404 page
  if (wordCount < 20 && 
      (contentLower.includes('not found') || contentLower.includes('404'))) {
    return true;
  }
  
  // If content is substantial (>200 words), it's likely not a 404 page
  // even if it contains some 404-like text
  if (wordCount > 200) {
    return false;
  }
  
  return false;
}

/**
 * Apply content filters to clean up extracted content
 */
export function applyContentFilters(content, config) {
  if (!content || !config.contentFilters) {
    return content;
  }

  let filteredContent = content;

  // Remove JavaScript code blocks and inline scripts
  if (config.contentFilters.removeScripts) {
    // Remove code blocks that look like JavaScript
    filteredContent = filteredContent.replace(/```(?:javascript|js|typescript|ts)[\s\S]*?```/g, '');
    // Remove inline JavaScript patterns
    filteredContent = filteredContent.replace(/self\.__next_f\.push\([^)]*\)/g, '');
    filteredContent = filteredContent.replace(/import\s+from\s+["'][^"']*["']/g, '');
    filteredContent = filteredContent.replace(/const\s+\w+\s*=\s*[^;]+;/g, '');
    filteredContent = filteredContent.replace(/function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g, '');
    filteredContent = filteredContent.replace(/async\s+function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g, '');
    filteredContent = filteredContent.replace(/=>\s*\{[^}]*\}/g, '');
    filteredContent = filteredContent.replace(/\.catch\([^)]*\)/g, '');
    filteredContent = filteredContent.replace(/\.then\([^)]*\)/g, '');
  }

  // Remove CSS and style content
  if (config.contentFilters.removeStyles) {
    filteredContent = filteredContent.replace(/```(?:css|scss|sass)[\s\S]*?```/g, '');
    filteredContent = filteredContent.replace(/style\s*=\s*["'][^"']*["']/g, '');
    filteredContent = filteredContent.replace(/class\s*=\s*["'][^"']*["']/g, '');
  }

  // Remove HTML comments
  if (config.contentFilters.removeComments) {
    filteredContent = filteredContent.replace(/<!--[\s\S]*?-->/g, '');
    filteredContent = filteredContent.replace(/\/\*[\s\S]*?\*\//g, '');
    filteredContent = filteredContent.replace(/\/\/.*$/gm, '');
  }

  // Remove empty elements and excessive whitespace
  if (config.contentFilters.removeEmptyElements) {
    filteredContent = filteredContent.replace(/\s+/g, ' ');
    filteredContent = filteredContent.replace(/^\s+|\s+$/gm, '');
  }

  // Limit code block length
  if (config.contentFilters.maxCodeBlockLength) {
    filteredContent = filteredContent.replace(/```[\s\S]*?```/g, (match) => {
      if (match.length > config.contentFilters.maxCodeBlockLength) {
        return match.substring(0, config.contentFilters.maxCodeBlockLength) + '...';
      }
      return match;
    });
  }

  // Remove common non-content patterns
  filteredContent = filteredContent.replace(/CopyCopied!/g, '');
  filteredContent = filteredContent.replace(/Find something\.\.\./g, '');
  filteredContent = filteredContent.replace(/self\.__next_f\.push\([^)]*\)/g, '');
  filteredContent = filteredContent.replace(/\[\"\$[^\"]*\",[^\]]*\]/g, '');
  filteredContent = filteredContent.replace(/\"\$\d+\"/g, '');
  filteredContent = filteredContent.replace(/\"\$L[^\"]*\"/g, '');
  
  // Remove Next.js specific patterns
  filteredContent = filteredContent.replace(/self\.__next_f\.push\(\[[^\]]*\]\)/g, '');
  filteredContent = filteredContent.replace(/\[\"\$[^\"]*\",[^\]]*\]/g, '');
  filteredContent = filteredContent.replace(/\"\$\d+\"/g, '');
  filteredContent = filteredContent.replace(/\"\$L[^\"]*\"/g, '');
  filteredContent = filteredContent.replace(/\"\$undefined\"/g, '');
  filteredContent = filteredContent.replace(/\"\$S[^\"]*\"/g, '');
  filteredContent = filteredContent.replace(/\"\$1[^\"]*\"/g, '');
  filteredContent = filteredContent.replace(/\"\$L\d+\"/g, '');
  filteredContent = filteredContent.replace(/\"\$L[a-zA-Z0-9]+\"/g, '');
  
  // Remove React/Next.js component patterns
  filteredContent = filteredContent.replace(/\[\"\$\",\"\$[^\"]*\",[^\]]*\]/g, '');
  filteredContent = filteredContent.replace(/\[\"\$\",\"html\",[^\]]*\]/g, '');
  filteredContent = filteredContent.replace(/\[\"\$\",\"\$L[^\"]*\",[^\]]*\]/g, '');
  
  // Remove template and style patterns
  filteredContent = filteredContent.replace(/templateStyles.*?\"\$undefined\"/g, '');
  filteredContent = filteredContent.replace(/templateScripts.*?\"\$undefined\"/g, '');
  filteredContent = filteredContent.replace(/notFound.*?\"\$undefined\"/g, '');
  filteredContent = filteredContent.replace(/forbidden.*?\"\$undefined\"/g, '');
  filteredContent = filteredContent.replace(/unauthorized.*?\"\$undefined\"/g, '');
  
  // Remove specific AR.IO site patterns
  filteredContent = filteredContent.replace(/else\s*\}\s*else\s*if\s*\([^)]*\)/g, '');
  filteredContent = filteredContent.replace(/if\s*\([^)]*===\s*['"]light['"]\|\|[^)]*===\s*['"]dark['"]\)/g, '');
  filteredContent = filteredContent.replace(/d\.style\.colorScheme\s*=\s*[^;]+/g, '');
  filteredContent = filteredContent.replace(/catch\s*\([^)]*\)\s*\{\s*\}\s*\}\s*\(\)/g, '');

  return filteredContent.trim();
}

/**
 * Extract page content and metadata using Defuddle or plain text processing
 */
async function extractPageMetadata(doc, url, config) {
  // Handle plain text files
  if (doc && doc.isPlainText) {
    const content = doc.textContent.replace(/\s+/g, ' ').trim();
    const estimatedWords = content.split(/\s+/).filter(word => word.length > 0).length;
    let title = generateTitleFromUrl(url);
    if (url.includes('glossary') && content.length > 0) {
      const firstLine = content.split('\n')[0];
      if (firstLine && firstLine.length < 100) {
        title = firstLine.trim();
      } else {
        title = 'Permaweb Glossary';
      }
    }
    return {
      url,
      title: cleanTitle(title),
      content,
      estimatedWords,
      lastModified: new Date().toISOString(),
      metadata: {},
      extractorType: 'plain-text',
      qualityScore: null
    };
  }

  // Always extract HTML string from Document for Defuddle
  const html = doc.documentElement ? doc.documentElement.outerHTML : '';
  let defuddleResult = null;
  let defuddleSuccess = false;
  let content = '';
  let estimatedWords = 0;
  let title = '';

  try {
    const defuddle = new Defuddle(html, {
      url,
      removeExactSelectors: true,
      removePartialSelectors: true,
      debug: false
    });
    defuddleResult = await defuddle.parse();
    if (defuddleResult && defuddleResult.content) {
      content = defuddleResult.content;
      estimatedWords = defuddleResult.wordCount || content.split(/\s+/).filter(word => word.length > 0).length;
      title = defuddleResult.title || '';
      defuddleSuccess = true;
      if (estimatedWords >= 50) {
        log.debug(`Defuddle extracted ${estimatedWords} words from ${url}`);
      }
    }
  } catch (error) {
    log.debug(`Defuddle error for ${url}: ${error.message}`);
  }

  // Fallback to manual extraction if Defuddle fails or extracts too little
  if (!defuddleSuccess || estimatedWords < 20) {
    if (defuddleSuccess && estimatedWords > 0) {
      log.debug(`Defuddle extracted only ${estimatedWords} words for ${url}, supplementing with manual extraction`);
    } else {
      log.warn(`Defuddle failed for ${url}, using fallback extraction`);
    }
    const contentSelectors = config.selectors.content.split(',').map(s => s.trim());
    let manualContent = '';
    for (const selector of contentSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        manualContent = element.textContent || '';
        if (manualContent.includes('<') && manualContent.includes('>')) {
          manualContent = manualContent
            .replace(/<[^>]*>/g, '')
            .replace(/&[^;]+;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        break;
      }
    }
    manualContent = manualContent.replace(/\s+/g, ' ').trim();
    const manualWords = manualContent.split(/\s+/).filter(word => word.length > 0).length;
    if (manualWords > estimatedWords) {
      content = manualContent;
      estimatedWords = manualWords;
      defuddleResult = null;
      log.debug(`Manual extraction provided ${manualWords} words (better than Defuddle's ${estimatedWords})`);
    }
  }

  // Use Defuddle's metadata and scoring if available
  const metadata = defuddleResult ? {
    description: defuddleResult.description,
    domain: defuddleResult.domain,
    favicon: defuddleResult.favicon,
    image: defuddleResult.image,
    published: defuddleResult.published,
    author: defuddleResult.author,
    site: defuddleResult.site,
    schemaOrgData: defuddleResult.schemaOrgData,
    metaTags: defuddleResult.metaTags
  } : {};
  const extractorType = defuddleResult ? defuddleResult.extractorType : 'manual';
  const qualityScore = defuddleResult ? defuddleResult.qualityScore : null;

  // Title fallback
  if (!title) {
    const titleSelectors = config.selectors.title.split(',').map(s => s.trim());
    for (const selector of titleSelectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent.trim()) {
        title = element.textContent.trim();
        break;
      }
    }
    if (!title) {
      title = generateTitleFromUrl(url);
    }
  }

  // Apply content filters
  content = applyContentFilters(content, config);
  estimatedWords = content.split(/\s+/).filter(word => word.length > 0).length;

  // 404 and quality checks
  if (is404Page(doc, title, content)) {
    log.warn(`404 page detected by content analysis: ${url} (${estimatedWords} words)`);
    return null;
  }
  const minWordCount = config.contentFilters?.minWordCount || 10;
  if (estimatedWords < minWordCount) {
    log.debug(`Page ${url} has only ${estimatedWords} words (below minimum ${minWordCount}), skipping`);
    return null;
  }

  return {
    url,
    title: cleanTitle(title),
    content,
    estimatedWords,
    lastModified: new Date().toISOString(),
    metadata,
    extractorType,
    qualityScore
  };
}

/**
 * Clean title text
 */
function cleanTitle(title) {
  return title
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-\(\)\[\]]/g, '')
    .trim()
    .substring(0, 200);
}

/**
 * Generate title from URL when no title found
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
 * Comprehensive discovery by scanning all links from seed URLs
 */
async function discoverSiblings(baseUrl, config) {
  const discovered = new Set();
  
  // Check each seed URL for all discoverable pages
  for (const seedPath of config.seedUrls) {
    const seedUrl = baseUrl + (seedPath.startsWith('/') ? seedPath : '/' + seedPath);
    const doc = await fetchPage(seedUrl);
    
    if (!doc) {
      log.warn(`Invalid seed: ${seedPath}`);
      continue;
    }
    
    log.success(`Valid seed: ${seedPath}`);
    
    // Extract all valid links using the same logic as main crawler
    const links = extractLinks(doc, seedUrl, config.baseUrl, config);
    
    // Add all discovered paths (not just siblings)
    for (const link of links) {
      try {
        const linkUrl = new URL(link);
        const linkPath = linkUrl.pathname;
        discovered.add(linkPath);
      } catch {
        // Skip invalid URLs
      }
    }
  }
  
  const discoveredArray = Array.from(discovered);
  

  
  log.discovery(`Found ${discoveredArray.length} discoverable pages`);
  
  return discoveredArray;
}

/**
 * Main crawl function
 */
export async function crawlSite(siteKey, options = {}) {
  const configs = await loadCrawlConfigs();
  const config = configs[siteKey];
  if (!config) {
    throw new Error(`Unknown site: ${siteKey}`);
  }
  
  const {
    maxDepth = config.maxDepth,
    maxPages = config.maxPages,
    onProgress = () => {},
    onError = () => {},
    forceReindex = false
  } = options;
  
  // Load existing index to avoid re-crawling (unless force reindex)
  const { indexData, existingUrls } = await loadExistingIndex();
  const existingPages = forceReindex ? [] : (indexData.sites[siteKey]?.pages || []);
  
  const visited = new Set();
  const seen = new Set();
  const pages = [...existingPages]; // Start with existing pages (empty if force reindex)
  const stack = [];
  const errors = [];
  const startTime = Date.now();
  let requestCount = 0;
  let totalResponseTime = 0;
  let skippedCount = 0;
  
  log.info(`Starting crawl of ${config.name}`);
  log.info(`Limits: ${maxDepth} depth, ${maxPages} pages`);
  log.info(`Rate limit: 2 req/sec with burst of 5`);
  
  if (forceReindex) {
    log.info(`Force reindex enabled - will crawl all pages from scratch`);
  } else if (existingPages.length > 0) {
    log.info(`Found ${existingPages.length} existing pages, will skip already crawled URLs`);
    // Mark existing URLs as seen to avoid re-crawling
    for (const page of existingPages) {
      seen.add(page.url);
    }

  }
  
  // Handle single-file sites (like text files)
  if (config.type === 'single-file' && config.fileUrl) {
    log.info(`Processing single file: ${config.fileUrl}`);
    
    // Skip if already exists and not force reindex
    if (!forceReindex && existingUrls.has(config.fileUrl)) {
      log.info(`Single file already exists in index, skipping`);
      return {
        pages: existingPages,
        errors: [],
        telemetry: {
          duration: 0,
          requestCount: 0,
          averageResponseTime: 0,
          pagesPerSecond: 0
        }
      };
    }
    
    try {
      onProgress(1, 1, config.fileUrl);
      
      const requestStart = Date.now();
      const doc = await fetchPage(config.fileUrl);
      const requestTime = Date.now() - requestStart;
      
      if (!doc) {
        throw new Error('Failed to fetch file');
      }
      
      const pageData = await extractPageMetadata(doc, config.fileUrl, config);
      if (!pageData) {
        throw new Error('Failed to extract content from file');
      }
      
      // Generate minimal breadcrumbs for single file
      const breadcrumbs = [config.name];
      
      const singlePage = {
        url: pageData.url,
        title: pageData.title,
        estimatedWords: pageData.estimatedWords,
        lastModified: pageData.lastModified,
        breadcrumbs,
        siteKey,
        siteName: config.name,
        depth: 0,
        crawledAt: new Date().toISOString()
      };
      
      log.success(`Single file processed: ${pageData.title} (${pageData.estimatedWords} words, ${requestTime}ms)`);
      
      const crawlDuration = Date.now() - requestStart;
      
      return {
        pages: [singlePage],
        errors: [],
        telemetry: {
          duration: crawlDuration,
          requestCount: 1,
          averageResponseTime: requestTime,
          pagesPerSecond: 1 / (crawlDuration / 1000)
        }
      };
      
    } catch (error) {
      log.error(`Failed to process single file: ${error.message}`);
      return {
        pages: [],
        errors: [{ url: config.fileUrl, error: error.message, depth: 0 }],
        telemetry: {
          duration: Date.now() - startTime,
          requestCount: 1,
          averageResponseTime: 0,
          pagesPerSecond: 0
        }
      };
    }
  }
  
  // Discover entry points
  const discoveredPaths = await discoverSiblings(config.baseUrl, config);
  
  // PRIORITIZE SEED URLS: Always include all seed URLs first, then add discovered paths
  const entryPointsToUse = [
    ...config.seedUrls, // All seed URLs come first
    ...discoveredPaths.filter(path => !config.seedUrls.includes(path)) // Add discovered paths that aren't already seed URLs
  ].slice(0, 50); // Increased limit to accommodate all seed URLs + some discovered paths
  

  
  log.discovery(`Using ${entryPointsToUse.length} entry points from ${discoveredPaths.length} discovered + ${config.seedUrls.length} seed paths (prioritized)`);
  
  // Add entry points to stack with proper depth calculation
  for (const entryPoint of entryPointsToUse.reverse()) {
    const url = config.baseUrl + (entryPoint.startsWith('/') ? entryPoint : '/' + entryPoint);
    if (!seen.has(url)) {
      const pathParts = entryPoint.split('/').filter(Boolean);
      const calculatedDepth = pathParts.length;
      

      
      stack.push({ url, depth: calculatedDepth });
      seen.add(url);
    }
  }
  
  // Crawl pages with simple FIFO queue
  while (stack.length > 0 && pages.length < maxPages) {
    const { url, depth } = stack.shift(); // Take next item (FIFO)
    
    if (visited.has(url) || depth > maxDepth) {
      continue;
    }
    
    // Skip if URL already exists in index (unless force reindex)
    if (!forceReindex && existingUrls.has(url)) {
      skippedCount++;
      continue;
    }
    
    visited.add(url);
    onProgress(pages.length + 1, maxPages, url);
    
    try {
      const requestStart = Date.now();
      const doc = await fetchPage(url);
      const requestTime = Date.now() - requestStart;
      
      requestCount++;
      totalResponseTime += requestTime;
      
      if (!doc) {
        errors.push({ url, error: 'Failed to fetch page', depth });
        onError(url, 'Failed to fetch page');
        continue;
      }
      
      const pageData = await extractPageMetadata(doc, url, config);
      if (!pageData) {
        log.warn(`Page rejected by quality filters: ${url}`);
        continue;
      }
      
      // Generate breadcrumbs from URL path
      const urlObj = new URL(pageData.url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const breadcrumbs = pathParts.map(part => 
        part.replace(/[-_]/g, ' ')
            .replace(/\.(html?|php|aspx?)$/i, '')
            .toLowerCase()
      );

      pages.push({
        url: pageData.url,
        title: pageData.title,
        estimatedWords: pageData.estimatedWords,
        lastModified: pageData.lastModified,
        breadcrumbs,
        siteKey,
        siteName: config.name,
        depth,
        crawledAt: new Date().toISOString()
      });
      
      log.success(`Page [${pages.length}/${maxPages}] ${pageData.title} (${pageData.estimatedWords} words, ${requestTime}ms)`);
      
      // Extract links for next level
      if (pages.length < maxPages && depth < maxDepth) {
        const links = extractLinks(doc, url, config.baseUrl, config);
        
        const newLinks = [];
        for (const link of links) {
          if (!seen.has(link)) {
            seen.add(link);
            newLinks.push({ url: link, depth: depth + 1 });
          }
        }
        
        // Add all new links to stack
        for (const linkData of newLinks) {
          stack.push(linkData);
        }
        
        log.discovery(`Found ${links.length} links -> ${newLinks.length} new URLs to crawl`);
      }
      
    } catch (error) {
      log.error(`Error crawling ${url}: ${error.message}`);
      errors.push({ url, error: error.message, depth });
      onError(url, error.message);
    }
  }
  
  const crawlDuration = Date.now() - startTime;
  const avgResponseTime = requestCount > 0 ? totalResponseTime / requestCount : 0;
  const newPagesCount = pages.length - existingPages.length;
  
  log.success(`Crawl complete: ${pages.length} pages (${newPagesCount} new, ${existingPages.length} existing), ${errors.length} errors`);
  log.info(`Duration: ${(crawlDuration / 1000).toFixed(1)}s, Avg response: ${avgResponseTime.toFixed(0)}ms`);
  log.info(`Rate: ${(requestCount / (crawlDuration / 1000)).toFixed(2)} req/sec`);
  
  if (skippedCount > 0) {
    log.info(`Skipped ${skippedCount} already indexed URLs`);
  }
  
  if (errors.length > 0) {
    log.error(`Errors: ${errors.length}`);
  }
  
  log.success(`Final result: ${pages.length} total pages (${newPagesCount} newly crawled)`);
  
  return {
    pages,
    errors,
    telemetry: {
      duration: crawlDuration,
      requestCount,
      averageResponseTime: avgResponseTime,
      pagesPerSecond: pages.length / (crawlDuration / 1000)
    }
  };
}

/**
 * Run crawl for all sites or specific site
 */
export async function runCrawl(specificSiteKey = null, options = {}) {
  const configs = await loadCrawlConfigs();
  const results = {};
  const { forceReindex = false, outputPath = null } = options;
  
  const sitesToCrawl = specificSiteKey ? [specificSiteKey] : Object.keys(configs);
  
  if (forceReindex) {
    log.info(`Running with force reindex - all sites will be crawled from scratch`);
  }
  
  for (const siteKey of sitesToCrawl) {
    if (!configs[siteKey]) {
      log.error(`Unknown site: ${siteKey}`);
      continue;
    }
    
    try {
      log.info(`Starting crawl for site: ${siteKey}...`);
      const result = await crawlSite(siteKey, { forceReindex });
      results[siteKey] = result;
      log.success(`Crawl for ${siteKey} completed successfully!`);
      log.info(`Total pages: ${result.pages.length}`);
    } catch (error) {
      log.error(`Failed to crawl ${siteKey}: ${error.message}`);
      results[siteKey] = { pages: [], errors: [{ error: error.message }] };
    }
  }
  
  // Prepare index data
  const indexData = {
    generated: new Date().toISOString(),
    sites: {}
  };
  
  for (const [siteKey, result] of Object.entries(results)) {
    if (result.pages && result.pages.length > 0) {
      indexData.sites[siteKey] = {
        name: configs[siteKey].name,
        baseUrl: configs[siteKey].baseUrl,
        pages: result.pages,
        lastCrawled: new Date().toISOString(),
        stats: {
          totalPages: result.pages.length,
          averageWords: Math.round(
            result.pages.reduce((sum, p) => sum + p.estimatedWords, 0) / result.pages.length
          ),
          ...(result.telemetry || {})
        }
      };
    }
  }
  
  // Use minified JSON in production or when MINIFY_INDEX env var is set
  const shouldMinify = process.env.NODE_ENV === 'production' || process.env.MINIFY_INDEX === 'true';
  const jsonOutput = shouldMinify 
    ? JSON.stringify(indexData)
    : JSON.stringify(indexData, null, 2);
  
  // Determine output path - custom path takes priority, then standard location
  let finalOutputPath;
  if (outputPath) {
    finalOutputPath = resolve(process.cwd(), outputPath);
  } else {
    // Default to public/docs-index.json (publicly accessible in Astro static sites)
    // Use temp file in local dev to avoid committing partial updates
    const isLocal = !(process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true');
    finalOutputPath = isLocal 
      ? resolve(process.cwd(), 'temp-docs-index.json')
      : resolve(process.cwd(), 'public/docs-index.json');
  }
  
  await fs.writeFile(finalOutputPath, jsonOutput);
  
  // Log size info
  const fileSize = (jsonOutput.length / 1024).toFixed(1);
  const formatType = shouldMinify ? 'minified' : 'pretty-printed';
  const outputType = outputPath ? 'custom path' : (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') ? 'production build' : 'local development';
  log.info(`Output: ${finalOutputPath} (${fileSize}KB, ${formatType}, ${outputType})`);
  
  if (!outputPath && !(process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true')) {
    log.info('Note: Running locally - index written to temp file to avoid committing partial updates');
  }
  
  return results;
}

/**
 * Show help information
 */
async function showHelp() {
  const configs = await loadCrawlConfigs();
  const sites = Object.keys(configs);
  
  console.log(`
${colors.blue}Permaweb Documentation Crawler${colors.reset}

${colors.green}Usage:${colors.reset}
  bun run crawl [site] [options]

${colors.green}Sites:${colors.reset}
${sites.map(site => `  ${colors.cyan}${site}${colors.reset} - ${configs[site].name}`).join('\n')}

${colors.green}Options:${colors.reset}
  ${colors.yellow}--force, --force-reindex${colors.reset}  Force reindex all pages (ignore cache)
  ${colors.yellow}--output <path>${colors.reset}           Custom output path for index file
  ${colors.yellow}--help, -h${colors.reset}               Show this help message

${colors.green}Examples:${colors.reset}
  bun run crawl                            # Crawl all sites (saves to temp file locally, public/docs-index.json in CI)
  bun run crawl hyperbeam                  # Crawl only Hyperbeam docs
  bun run crawl ao --force                 # Force reindex AO docs
  bun run crawl --output public/docs-index.json  # Output to public/docs-index.json (publicly accessible)

${colors.green}Production Mode:${colors.reset}
  Set NODE_ENV=production or MINIFY_INDEX=true to save minified JSON
  Saves ~26% storage space for deployment pipelines
`);
}

// CLI support
if (import.meta.main) {
  const args = process.argv.slice(2);
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    await showHelp();
    process.exit(0);
  }
  
  const forceReindex = args.includes('--force-reindex') || args.includes('--force');
  
  // Parse --output flag
  let customOutputPath = null;
  const outputIndex = args.findIndex(arg => arg === '--output');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    customOutputPath = args[outputIndex + 1];
  }
  
  // Filter out flags to get the site key
  const siteKey = args.find(arg => !arg.startsWith('--') && arg !== customOutputPath);
  
  try {
    await runCrawl(siteKey, { forceReindex, outputPath: customOutputPath });
  } catch (error) {
    log.error(`Crawl failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Export getCrawlConfigs as alias for loadCrawlConfigs for testing
 */
export const getCrawlConfigs = loadCrawlConfigs;

/**
 * Build display tree from crawl results for UI display
 * @param {Object} crawlResults - Results from crawl operations
 * @returns {Object} Structured tree for display
 */
export function buildDisplayTree(crawlResults) {
  const tree = {};
  
  for (const [siteKey, siteData] of Object.entries(crawlResults)) {
    tree[siteKey] = {
      siteKey,
      name: siteData.name || siteKey,
      pages: siteData.pages || [],
      categories: {},
      error: siteData.error || null
    };
    
    // Group pages by category
    if (siteData.pages && Array.isArray(siteData.pages)) {
      for (const page of siteData.pages) {
        const category = page.category || 'general';
        
        if (!tree[siteKey].categories[category]) {
          tree[siteKey].categories[category] = {
            name: category,
            pages: []
          };
        }
        
        tree[siteKey].categories[category].pages.push(page);
      }
    }
  }
  
  return tree;
} 