/**
 * Simple browser-based crawler for Permaweb documentation sites
 * Discovers pages by following links with basic sibling discovery
 */

import { JSDOM } from 'jsdom';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import Defuddle from 'defuddle';
import { createHash } from 'crypto';

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
    
    // Check if configuration has changed
    const currentConfigs = await loadCrawlConfigs();
    const configChanged = !indexData.configHash || indexData.configHash !== currentConfigs._configHash;
    
    if (configChanged) {
      log.info(`Configuration changed detected (old: ${indexData.configHash || 'none'}, new: ${currentConfigs._configHash})`);
      log.info('Will perform full recrawl due to configuration changes');
      // Return empty data to force full recrawl
      return { 
        indexData: { generated: new Date().toISOString(), configHash: currentConfigs._configHash, sites: {} }, 
        existingUrls: new Set() 
      };
    }
    
    // Create a Set of all existing URLs for fast lookup
    const existingUrls = new Set();
    for (const siteData of Object.values(indexData.sites || {})) {
      for (const page of siteData.pages || []) {
        existingUrls.add(page.url);
      }
    }
    
    log.info(`Loaded existing index from: ${indexPath} (config hash: ${indexData.configHash})`);
    
    return { indexData, existingUrls };
  } catch (error) {
    // If no existing index, return empty data
    const currentConfigs = await loadCrawlConfigs();
    return { 
      indexData: { generated: new Date().toISOString(), configHash: currentConfigs._configHash, sites: {} }, 
      existingUrls: new Set() 
    };
  }
}

/**
 * Generate hash of crawl configuration for change detection
 */
function generateConfigHash(configs) {
  const configString = JSON.stringify(configs, (key, value) => {
    // Sort arrays to ensure consistent hashing
    if (Array.isArray(value)) {
      return value.sort();
    }
    return value;
  });
  return createHash('sha256').update(configString).digest('hex').substring(0, 8);
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

    // Add configuration hash for change detection (don't include in site enumeration)
    const configHash = generateConfigHash(rawConfigs);
    crawlConfigs._configHash = configHash;
    log.debug(`Configuration hash: ${configHash}`);

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
        'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0)',
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

    // Handle HTML content
    const dom = new JSDOM(content, { url });
    return dom.window.document;
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
    return new URL(href, baseUrl).href;
  } catch {
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
    if (urlObj.hostname !== baseUrlObj.hostname) return false;
    
    // Skip URLs with hash fragments (anchor links)
    if (urlObj.hash) return false;
    
    // Check exclude patterns
    for (const pattern of config.excludePatterns) {
      if (pattern.test(url)) return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect if a page is a 404 error page based on content
 */
function is404Page(doc, title, content) {
  // Check title for 404 indicators
  const titleLower = title.toLowerCase();
  if (titleLower.includes('404') || 
      titleLower.includes('not found') || 
      titleLower.includes('page not found') ||
      titleLower.includes('file not found')) {
    return true;
  }
  
  // Check content for 404 indicators
  const contentLower = content.toLowerCase();
  if (contentLower.includes('404') && 
      (contentLower.includes('not found') || 
       contentLower.includes('page not found') ||
       contentLower.includes('file not found'))) {
    return true;
  }
  
  // Check for very short content that might be a 404 page
  if (content.split(/\s+/).filter(word => word.length > 0).length < 20 &&
      (contentLower.includes('not found') || contentLower.includes('404'))) {
    return true;
  }
  
  return false;
}

/**
 * Extract page content and metadata using Defuddle or plain text processing
 */
async function extractPageMetadata(doc, url, config) {
  // Handle plain text files
  if (doc && doc.isPlainText) {
    const content = doc.textContent.replace(/\s+/g, ' ').trim();
    const estimatedWords = content.split(/\s+/).filter(word => word.length > 0).length;
    
    // Generate title from URL or content for plain text files
    let title = generateTitleFromUrl(url);
    
    // For glossary files, try to extract a better title from content
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
      lastModified: new Date().toISOString()
    };
  }
  
  // Handle HTML documents
  // Extract title
  let title = '';
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
  
  // Try Defuddle first for better content extraction
  let content = '';
  let estimatedWords = 0;
  let defuddleSuccess = false;
  
  try {
    // Create Defuddle instance with the document
    const defuddle = new Defuddle(doc, {
      cleanConditionally: true,
      removeUnlikelyRoles: true,
      removeEmptyTextNodes: true,
      removeUselessElements: true
    });
    
    const defuddleResult = defuddle.parse();
    if (defuddleResult && defuddleResult.content) {
      content = defuddleResult.content.replace(/\s+/g, ' ').trim();
      estimatedWords = content.split(/\s+/).filter(word => word.length > 0).length;
      defuddleSuccess = true;
      
      // Log successful Defuddle extractions for debugging
      if (estimatedWords >= 50) {
        log.debug(`Defuddle extracted ${estimatedWords} words from ${url}`);
      }
    }
  } catch (error) {
    log.debug(`Defuddle error for ${url}: ${error.message}`);
  }
  
  // Fallback to manual content extraction if Defuddle fails or extracts too little
  if (estimatedWords < 20) { // Reduced threshold from 50 to 20
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
        break;
      }
    }
    
    manualContent = manualContent.replace(/\s+/g, ' ').trim();
    const manualWords = manualContent.split(/\s+/).filter(word => word.length > 0).length;
    
    // Use the better extraction (Defuddle vs manual)
    if (manualWords > estimatedWords) {
      content = manualContent;
      estimatedWords = manualWords;
      log.debug(`Manual extraction provided ${manualWords} words (better than Defuddle's ${estimatedWords})`);
    } else if (estimatedWords > 0) {
      log.debug(`Keeping Defuddle content (${estimatedWords} words vs manual ${manualWords})`);
    } else {
      content = manualContent;
      estimatedWords = manualWords;
    }
  }
  
  // Check if this is a 404 page
  if (is404Page(doc, title, content)) {
    log.warn(`404 page detected by content analysis: ${url}`);
    return null;
  }
  
  // Basic quality check
  if (estimatedWords < 10) {
    return null;
  }
  
  return {
    url,
    title: cleanTitle(title),
    content,
    estimatedWords,
    lastModified: new Date().toISOString()
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
 * Simple sibling discovery by scanning all links
 */
async function discoverSiblings(baseUrl, config) {
  const discovered = new Set();
  
  // Check each seed URL for siblings
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
    
    // Group links by section (first path segment)
    const seedSection = seedPath.split('/').filter(Boolean)[0];
    for (const link of links) {
      try {
        const linkUrl = new URL(link);
        const linkPath = linkUrl.pathname;
        const pathSection = linkPath.split('/').filter(Boolean)[0];
        if (pathSection === seedSection) {
          discovered.add(linkPath);
        }
      } catch {
        // Skip invalid URLs
      }
    }
  }
  
  const discoveredArray = Array.from(discovered);
  log.discovery(`Found ${discoveredArray.length} sibling pages`);
  
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
        description: pageData.content ? pageData.content.substring(0, 200) + '...' : '',
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
  const entryPointsToUse = discoveredPaths.slice(0, 15); // Use up to 15 entry points
  
  log.discovery(`Using ${entryPointsToUse.length} entry points`);
  
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
  
  // Crawl pages
  while (stack.length > 0 && pages.length < maxPages) {
    const { url, depth } = stack.pop();
    
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
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
      );

      // Only store metadata, not content (content fetched dynamically for llms.txt)
      pages.push({
        url: pageData.url,
        title: pageData.title,
        description: pageData.content ? pageData.content.substring(0, 200) + '...' : '',
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
        
        for (const linkData of newLinks.reverse()) {
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
    configHash: configs._configHash,
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