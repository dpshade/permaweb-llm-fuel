/**
 * Simple browser-based crawler for Permaweb documentation sites
 * Discovers pages by following links with basic sibling discovery
 */

import { JSDOM } from 'jsdom';
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
  discovery: (msg) => console.log(`${colors.magenta}DISCOVERY${colors.reset} ${msg}`)
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
    const indexPath = resolve(process.cwd(), 'public/docs-index.json');
    const indexJson = readFileSync(indexPath, 'utf8');
    const indexData = JSON.parse(indexJson);
    
    // Create a Set of all existing URLs for fast lookup
    const existingUrls = new Set();
    for (const siteData of Object.values(indexData.sites || {})) {
      for (const page of siteData.pages || []) {
        existingUrls.add(page.url);
      }
    }
    
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

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    return dom.window.document;
  } catch (error) {
    log.error(`Fetch failed for ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Extract all links from a page with simple filtering
 */
function extractLinks(doc, baseUrl, config) {
  const links = [];
  const allLinks = doc.querySelectorAll('a[href]');
  
  for (const link of allLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;
    
    const resolvedUrl = resolveUrl(href, baseUrl);
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
 * Extract page content and metadata using Defuddle
 */
async function extractPageMetadata(doc, url, config) {
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
  
  try {
    const defuddleResult = await Defuddle.extract(doc.documentElement.outerHTML);
    if (defuddleResult && defuddleResult.textContent) {
      content = defuddleResult.textContent.replace(/\s+/g, ' ').trim();
      estimatedWords = content.split(/\s+/).filter(word => word.length > 0).length;
    }
  } catch (error) {
    // Fallback to manual extraction
  }
  
  // Fallback to manual content extraction if Defuddle fails
  if (estimatedWords < 50) {
    log.warn(`Defuddle failed for ${url}, using fallback extraction:`);
    const contentSelectors = config.selectors.content.split(',').map(s => s.trim());
    for (const selector of contentSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        content = element.textContent || '';
        break;
      }
    }
    
    content = content.replace(/\s+/g, ' ').trim();
    estimatedWords = content.split(/\s+/).filter(word => word.length > 0).length;
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
    
    // Find all internal links
    const allLinks = doc.querySelectorAll('a[href]');
    const sectionLinks = new Set();
    
    for (const link of allLinks) {
      const href = link.getAttribute('href');
      if (!href) continue;
      
      // Skip external links, anchors, files
      if (href.startsWith('http') || href.startsWith('#') || 
          href.includes('mailto:') || href.includes('#') ||
          href.match(/\.(pdf|zip|tar|gz)$/)) {
        continue;
      }
      
      // Normalize path
      const path = href.startsWith('/') ? href : '/' + href;
      sectionLinks.add(path);
    }
    
    // Group links by section (first path segment)
    const seedSection = seedPath.split('/').filter(Boolean)[0];
    for (const path of sectionLinks) {
      const pathSection = path.split('/').filter(Boolean)[0];
      if (pathSection === seedSection) {
        discovered.add(path);
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
      
      pages.push({
        ...pageData,
        siteKey,
        siteName: config.name,
        depth,
        crawledAt: new Date().toISOString()
      });
      
      log.success(`Page [${pages.length}/${maxPages}] ${pageData.title} (${pageData.estimatedWords} words, ${requestTime}ms)`);
      
      // Extract links for next level
      if (pages.length < maxPages && depth < maxDepth) {
        const links = extractLinks(doc, config.baseUrl, config);
        
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
  const { forceReindex = false } = options;
  
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
  
  // Save results
  const outputPath = resolve(process.cwd(), 'public/docs-index.json');
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
  
  await fs.writeFile(outputPath, JSON.stringify(indexData, null, 2));
  log.info(`Output: ${outputPath}`);
  
  return results;
}

// CLI support
if (import.meta.main) {
  const args = process.argv.slice(2);
  const forceReindex = args.includes('--force-reindex') || args.includes('--force');
  
  // Filter out flags to get the site key
  const siteKey = args.find(arg => !arg.startsWith('--'));
  
  try {
    await runCrawl(siteKey, { forceReindex });
  } catch (error) {
    log.error(`Crawl failed: ${error.message}`);
    process.exit(1);
  }
} 