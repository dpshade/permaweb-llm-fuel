/**
 * Dynamic browser-based crawler for Permaweb documentation sites
 * Discovers pages by following links and analyzing site structures
 * Enhanced with Wayfinder SDK for respectful gateway load balancing
 */

import { JSDOM } from 'jsdom';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import Defuddle from 'defuddle';

// Wayfinder SDK imports - conditional for browser/node compatibility
let Wayfinder, NetworkGatewaysProvider, SimpleCacheGatewaysProvider, 
    FastestPingRoutingStrategy, RoundRobinRoutingStrategy, 
    HashVerificationStrategy, ARIO;

try {
  if (typeof window === 'undefined') {
    // Node.js environment
    const wayfinderModule = await import('@ar.io/wayfinder-core');
    const arioModule = await import('@ar.io/sdk');
    
    ({ Wayfinder, NetworkGatewaysProvider, SimpleCacheGatewaysProvider, 
       FastestPingRoutingStrategy, RoundRobinRoutingStrategy, 
       HashVerificationStrategy } = wayfinderModule);
    
    // Fix ARIO import
    const { IO } = arioModule;
    ARIO = IO;
  }
} catch (error) {
  console.warn('Wayfinder SDK not available, falling back to direct fetch:', error.message);
}

// Cache for loaded configuration
let crawlConfigs = null;
let wayfinderInstance = null;

/**
 * Initialize Wayfinder instance for respectful crawling
 * @returns {Promise<Object|null>} Wayfinder instance or null if not available
 */
async function initializeWayfinder() {
  if (wayfinderInstance || !Wayfinder) {
    return wayfinderInstance;
  }

  try {
    wayfinderInstance = new Wayfinder({
      // Cache top 10 gateways by operator stake for 1 hour
      gatewaysProvider: new SimpleCacheGatewaysProvider({
        ttlSeconds: 60 * 60, // 1 hour cache
        gatewaysProvider: new NetworkGatewaysProvider({
          ario: ARIO.init(),
          sortBy: 'operatorStake',
          sortOrder: 'desc',
          limit: 10,
        }),
      }),
      // Use the fastest pinging strategy for best performance
      routingSettings: {
        strategy: new FastestPingRoutingStrategy({
          timeoutMs: 2000, // 2-second timeout for pings
        }),
        events: {
          onRoutingStarted: (event) => {
            console.log(`🔄 Routing request: ${event.originalUrl}`);
          },
          onRoutingSkipped: (event) => {
            console.log(`⏭️ Routing skipped: ${event.reason}`);
          },
          onRoutingSucceeded: (event) => {
            console.log(`✅ Routed to: ${event.targetGateway}`);
          },
        },
      },
      // Enable verification for data integrity
      verificationSettings: {
        enabled: false, // Disable for regular web content
        strategy: new HashVerificationStrategy({
          trustedGateways: ['https://permagate.io', 'https://arweave.net'],
        }),
        strict: false, // Don't fail on verification errors for web content
        events: {
          onVerificationProgress: (event) => {
            console.log(`🔍 Verification: ${((event.processedBytes / event.totalBytes) * 100).toFixed(1)}%`);
          },
          onVerificationSucceeded: (event) => {
            console.log(`✅ Verified: ${event.txId}`);
          },
          onVerificationFailed: (event) => {
            console.warn(`⚠️ Verification failed: ${event.error.message}`);
          },
        },
      },
      // Enable telemetry for monitoring
      telemetrySettings: {
        enabled: true,
        sampleRate: 0.1, // 10% sample rate
      },
    });

    console.log('🚀 Wayfinder initialized for respectful crawling');
    return wayfinderInstance;
  } catch (error) {
    console.warn('Failed to initialize Wayfinder:', error.message);
    wayfinderInstance = null;
    return null;
  }
}

/**
 * Rate limiter for respectful crawling
 */
class RateLimiter {
  constructor(requestsPerSecond = 2, burstSize = 5) {
    this.requestsPerSecond = requestsPerSecond;
    this.burstSize = burstSize;
    this.tokens = burstSize;
    this.lastRefill = Date.now();
    this.queue = [];
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
 * Load crawl configuration from JSON file
 * @returns {Promise<Object>} Crawl configurations
 */
async function loadCrawlConfigs() {
  if (crawlConfigs) {
    return crawlConfigs;
  }

  try {
    let configJson;
    
    if (typeof window === 'undefined') {
      // Node.js environment - read from file system
      const { readFileSync } = await import('fs');
      const { resolve } = await import('path');
      const configPath = resolve(process.cwd(), 'public/crawl-config.json');
      configJson = readFileSync(configPath, 'utf8');
    } else {
      // Browser environment - fetch from public path
      const response = await fetch('/crawl-config.json');
      if (!response.ok) {
        throw new Error(`Failed to load crawl config: ${response.status}`);
      }
      configJson = await response.text();
    }

    const rawConfigs = JSON.parse(configJson);
    
    // Convert string regex patterns back to RegExp objects
    crawlConfigs = {};
    for (const [key, config] of Object.entries(rawConfigs)) {
      crawlConfigs[key] = {
        ...config,
        excludePatterns: config.excludePatterns.map(pattern => {
          // Remove the leading and trailing slashes and flags
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
    console.error('Failed to load crawl configuration:', error);
    // Fallback to empty config
    crawlConfigs = {};
    return crawlConfigs;
  }
}

/**
 * Enhanced fetch with Wayfinder support and rate limiting
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Document|null>} Parsed DOM document or null if failed
 */
async function fetchPage(url, options = {}) {
  // Apply rate limiting
  await rateLimiter.acquire();
  
  try {
    const wayfinder = await initializeWayfinder();
    let response;
    let html;
    
    // Check if this is an ar:// URL that should use Wayfinder
    if (url.startsWith('ar://') && wayfinder) {
      console.log(`🌐 Using Wayfinder for ar:// URL: ${url}`);
      try {
        response = await wayfinder.request(url);
        html = await response.text();
      } catch (wayfinderError) {
        console.warn(`Wayfinder failed for ${url}:`, wayfinderError.message);
        throw wayfinderError;
      }
    } else {
      // Regular HTTP/HTTPS URL - try direct fetch first, then fallback
      try {
        response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0; +https://permaweb-llms.ar.io)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          },
          mode: 'cors',
          signal: AbortSignal.timeout(15000), // 15 second timeout
          ...options
        });
        
        if (response.ok) {
          html = await response.text();
        } else {
          console.warn(`HTTP ${response.status} for ${url}`);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
      } catch (corsError) {
        // If CORS fails, use HyperBEAM relay service with rate limiting
        console.warn(`CORS failed for ${url}, using HyperBEAM relay...`);
        
        // Additional delay for relay usage to be extra respectful
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const relayUrl = `https://router-1.forward.computer/~relay@1.0/call?relay-path=${encodeURIComponent(url)}&relay-method=GET`;
        
        response = await fetch(relayUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0; +https://permaweb-llms.ar.io)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(20000), // 20 second timeout for relay
        });
        
        if (!response.ok) {
          console.warn(`Relay HTTP ${response.status} for ${url}`);
          throw new Error(`Relay failed with HTTP ${response.status}: ${response.statusText}`);
        }
        
        html = await response.text();
      }
    }

    // Enhanced 404 detection with more patterns
    const is404Content = 
      (html.includes('404') && (
        html.includes('not found') || 
        html.includes('Not Found') || 
        html.includes('NOT FOUND') ||
        html.includes('Page not found') ||
        html.includes('File not found')
      )) ||
      html.includes('404s suck!') || 
      html.includes('Our vision is an internet with no more 404s') ||
      html.includes('This page could not be found') ||
      html.includes('The requested URL was not found');

    if (is404Content) {
      console.warn(`404 page detected: ${url}`);
      return null;
    }

    // Parse the HTML using DOMParser (browser) or JSDOM (Node.js)
    let doc;
    if (typeof window === 'undefined') {
      // Node.js environment
      const dom = new JSDOM(html, { url });
      doc = dom.window.document;
    } else {
      // Browser environment
      const parser = new DOMParser();
      doc = parser.parseFromString(html, 'text/html');
    }
    
    // Enhanced content quality validation
    const bodyText = doc.body?.textContent?.toLowerCase() || '';
    const title = doc.title?.toLowerCase() || '';
    
    // Check for explicit 404 indicators
    const is404Page = (
      title.includes('404') ||
      title.includes('not found') ||
      title.includes('page not found') ||
      (bodyText.includes('404') && (
        bodyText.includes('not found') ||
        bodyText.includes('page not found') ||
        bodyText.includes('does not exist') ||
        bodyText.includes('could not be found')
      )) ||
      bodyText.includes('404s suck') ||
      bodyText.includes('vision is an internet with no more 404s')
    );
    
    if (is404Page) {
      console.warn(`404 content detected: ${url}`);
      return null;
    }

    // Check for JavaScript-heavy pages with minimal content
    const scriptTags = doc.querySelectorAll('script');
    const scriptContent = Array.from(scriptTags).map(script => script.textContent || '').join(' ');
    const contentElements = doc.querySelectorAll('main, article, .content, .markdown-body, p, h1, h2, h3, h4, h5, h6');
    const actualContent = Array.from(contentElements).map(el => el.textContent || '').join(' ').trim();
    
    // If the page is mostly JavaScript and has very little actual content, skip it
    if (scriptContent.length > actualContent.length * 3 && actualContent.length < 200) {
      console.warn(`JavaScript-heavy page with minimal content detected: ${url}`);
      return null;
    }

    // Additional bot detection patterns
    const botDetectionPatterns = [
      'please enable javascript',
      'javascript is required',
      'this site requires javascript',
      'enable javascript in your browser',
      'you need to enable javascript'
    ];

    const isJSRequired = botDetectionPatterns.some(pattern => 
      bodyText.includes(pattern.toLowerCase())
    );

    if (isJSRequired && actualContent.length < 500) {
      console.warn(`JavaScript-required page with minimal content: ${url}`);
      return null;
    }
    
    return doc;
    
  } catch (error) {
    console.warn(`Failed to fetch ${url}:`, error.message);
    return null;
  }
}

/**
 * Categorize links into navigation (same depth) and content (deeper) links
 * @param {Document} doc - Parsed HTML document  
 * @param {string[]} links - Array of links to categorize
 * @param {Object} config - Site configuration
 * @returns {Object} Object with navigationLinks and contentLinks arrays
 */
function categorizeLinks(doc, links, config) {
  const navigationLinks = [];
  const contentLinks = [];
  
  // Get navigation-specific links with higher confidence
  const navSelectors = config.selectors.navigation.split(',').map(s => s.trim());
  const navElements = new Set();
  
  for (const selector of navSelectors) {
    try {
      const elements = doc.querySelectorAll(selector);
      elements.forEach(el => {
        const href = el.getAttribute('href');
        if (href) {
          const absoluteUrl = resolveUrl(href, config.baseUrl);
          if (absoluteUrl) navElements.add(absoluteUrl);
        }
      });
    } catch (e) {
      // Selector might not be valid
    }
  }
  
  // Also look for common navigation patterns
  const navPatternSelectors = [
    'header nav a', 'nav a', '.navbar a', '.menu a',
    '.sidebar nav a', '.navigation a', '.nav-menu a',
    '[role="navigation"] a', '.breadcrumb a', '.toc a'
  ];
  
  for (const selector of navPatternSelectors) {
    try {
      const elements = doc.querySelectorAll(selector);
      elements.forEach(el => {
        const href = el.getAttribute('href');
        if (href) {
          const absoluteUrl = resolveUrl(href, config.baseUrl);
          if (absoluteUrl) navElements.add(absoluteUrl);
        }
      });
    } catch (e) {
      // Selector might not be valid
    }
  }
  
  // Categorize each link
  for (const link of links) {
    if (navElements.has(link)) {
      navigationLinks.push(link);
    } else {
      // Additional heuristics for navigation vs content
      const urlPath = new URL(link).pathname;
      const isNavigation = 
        navElements.has(link) ||
        isLikelyNavigation(urlPath) ||
        hasNavigationContext(doc, link);
      
      if (isNavigation) {
        navigationLinks.push(link);
      } else {
        contentLinks.push(link);
      }
    }
  }
  
  return { navigationLinks, contentLinks };
}

/**
 * Check if URL path indicates navigation vs content
 * @param {string} urlPath - URL pathname
 * @returns {boolean} True if likely navigation
 */
function isLikelyNavigation(urlPath) {
  const segments = urlPath.split('/').filter(Boolean);
  
  // Short paths are more likely navigation
  if (segments.length <= 2) return true;
  
  // Check for navigation keywords
  const navKeywords = [
    'docs', 'guides', 'tutorials', 'reference', 'api',
    'concepts', 'examples', 'getting-started', 'quick-start'
  ];
  
  return segments.some(segment => 
    navKeywords.some(keyword => segment.toLowerCase().includes(keyword))
  );
}

/**
 * Check if a link appears in navigation context within the document
 * @param {Document} doc - Parsed HTML document
 * @param {string} link - Link to check
 * @returns {boolean} True if link appears in navigation context
 */
function hasNavigationContext(doc, link) {
  try {
    // Find all links with this href
    const linkElements = doc.querySelectorAll(`a[href="${link}"], a[href="${link.replace(/^https?:\/\/[^\/]+/, '')}"]`);
    
    for (const element of linkElements) {
      // Check if link is within navigation context
      const navParent = element.closest('nav, .nav, .navbar, .menu, .sidebar, .navigation, [role="navigation"]');
      if (navParent) return true;
      
      // Check if parent has navigation-related classes
      const parent = element.parentElement;
      if (parent && parent.className) {
        const className = parent.className.toLowerCase();
        if (className.includes('nav') || className.includes('menu') || className.includes('sidebar')) {
          return true;
        }
      }
    }
  } catch (e) {
    // Error checking context
  }
  
  return false;
}

/**
 * Extract links from a page based on site configuration
 * @param {Document} doc - Parsed HTML document
 * @param {string} baseUrl - Base URL for resolving relative links
 * @param {Object} config - Site configuration
 * @returns {string[]} Array of discovered URLs
 */
function extractLinks(doc, baseUrl, config, currentPageUrl = null) {
  const links = new Set();
  const resolveBase = currentPageUrl || baseUrl;
  
  // ONLY extract actual <a> tags with href attributes
  // Do not use content selectors as they may capture non-link text
  const linkSelectors = [
    'a[href]',  // Basic anchor links
    'nav a[href]', // Navigation links
    '.sidebar a[href]', // Sidebar links
    '.nav a[href]', // Nav menu links
    '.toc a[href]', // Table of contents links
    '.menu a[href]', // Menu links
    '.docs-nav a[href]', // Documentation navigation
    '.page-nav a[href]', // Page navigation
    '.content-nav a[href]', // Content navigation
    '.left-sidebar a[href]', // Left sidebar
    '.right-sidebar a[href]', // Right sidebar
    '.navigation a[href]', // Navigation containers
    '.doc-nav a[href]' // Document navigation
  ];

  for (const selector of linkSelectors) {
    try {
      const elements = doc.querySelectorAll(selector);
      elements.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.trim()) {
          const absoluteUrl = resolveUrl(href, resolveBase);
          if (absoluteUrl && isValidUrl(absoluteUrl, baseUrl, config)) {
            links.add(absoluteUrl);
          }
        }
      });
    } catch (e) {
      console.warn(`Selector failed: ${selector}`, e);
    }
  }
  
  // Fallback: only look for actual <a> tags, not arbitrary content
  if (links.size < 5) {
    const fallbackLinks = doc.querySelectorAll('a[href]');
    fallbackLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.trim()) {
        const absoluteUrl = resolveUrl(href, resolveBase);
        if (absoluteUrl && isValidUrl(absoluteUrl, baseUrl, config)) {
          links.add(absoluteUrl);
        }
      }
    });
  }

  return [...links];
}

/**
 * Resolve relative URLs to absolute URLs and strip fragment identifiers
 * @param {string} href - URL to resolve
 * @param {string} baseUrl - Base URL
 * @returns {string|null} Resolved absolute URL without fragment or null
 */
function resolveUrl(href, baseUrl) {
  try {
    if (href.startsWith('http')) {
      const url = new URL(href);
      // Strip fragment identifier to avoid duplicates
      url.hash = '';
      return url.toString();
    }
    
    const base = new URL(baseUrl);
    const resolved = new URL(href, base);
    // Strip fragment identifier to avoid duplicates
    resolved.hash = '';
    return resolved.toString();
  } catch (error) {
    return null;
  }
}

/**
 * Check if URL is valid for crawling based on site config
 * @param {string} url - URL to validate
 * @param {string} baseUrl - Base URL
 * @param {Object} config - Site configuration
 * @returns {boolean} Whether URL should be crawled
 */
function isValidUrl(url, baseUrl, config) {
  try {
    const urlObj = new URL(url);
    const baseObj = new URL(baseUrl);
    
    // Must be same origin
    if (urlObj.origin !== baseObj.origin) {
      return false;
    }
    
    // Check exclude patterns
    for (const pattern of config.excludePatterns) {
      if (pattern.test(url)) {
        return false;
      }
    }
    
    const path = urlObj.pathname;
    
    // Exclude obvious non-content URLs
    if (
      path.includes('/assets/') ||
      path.includes('/static/') ||
      path.includes('/js/') ||
      path.includes('/css/') ||
      path.includes('/images/') ||
      path.includes('/img/') ||
      path.endsWith('.js') ||
      path.endsWith('.css') ||
      path.endsWith('.png') ||
      path.endsWith('.jpg') ||
      path.endsWith('.gif') ||
      path.endsWith('.svg') ||
      path.endsWith('.ico') ||
      path.endsWith('.json') ||
      path.endsWith('.xml')
    ) {
      return false;
    }
    
    // More restrictive validation for documentation pages
    const isDocumentationUrl = (
      // Allow directory paths
      path.endsWith('/') ||
      // Allow standard documentation file extensions
      path.endsWith('.html') ||
      path.endsWith('.md') ||
      // Allow known documentation directories
      path.includes('/docs/') ||
      path.includes('/build/') ||
      path.includes('/guides/') ||
      path.includes('/tutorials/') ||
      path.includes('/reference/') ||
      path.includes('/api/') ||
      path.includes('/concepts/') ||
      path.includes('/getting-started/') ||
      path.includes('/welcome/') ||
      path.includes('/introduction/') ||
      path.includes('/run/')
    );
    
    return isDocumentationUrl;
    
  } catch (error) {
    return false;
  }
}

/**
 * Extract page metadata from document using Defuddle
 * @param {Document} doc - Parsed HTML document
 * @param {string} url - Page URL
 * @param {Object} config - Site configuration
 * @returns {Object} Page metadata
 */
function extractPageMetadata(doc, url, config) {
  let title = 'Untitled';
  let estimatedWords = 0;
  let description = '';
  let author = '';
  
  try {
    // Use Defuddle for better content extraction and metadata
    const defuddle = new Defuddle(doc, {
      debug: false,
      url: url,
      markdown: true // Get markdown output for cleaner content
    });
    
    const result = defuddle.parse();
    
    // Enhanced content quality filtering - reduced threshold
    if (result.wordCount < 50) {
      console.warn(`Low word count (${result.wordCount}) for ${url}`);
      throw new Error('Low word count, using fallback');
    }

    // Check for generic/boilerplate titles
    const genericTitles = ['documentation', 'home', 'index', 'untitled', '404', 'not found'];
    const titleLower = (result.title || '').toLowerCase();
    const isGenericTitle = genericTitles.some(generic => 
      titleLower === generic || titleLower.endsWith(` - ${generic}`)
    );

    // Additional quality checks
    const content = result.content || '';
    const contentLower = content.toLowerCase();
    
    // Check for error pages or low-quality content
    if (contentLower.includes('404s suck') || 
        contentLower.includes('our vision is an internet with no more 404s') ||
        contentLower.includes('self.__next_f=self.__next_f') ||
        content.includes('function(){try{var d=document.documentElement')) {
      console.warn(`Error page or JavaScript content detected: ${url}`);
      throw new Error('Error page detected, using fallback');
    }

    // Check content-to-JavaScript ratio
    const scriptMatches = content.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
    const scriptContent = scriptMatches.join('');
    const actualContent = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').trim();
    
    if (scriptContent.length > actualContent.length && result.wordCount < 200) {
      console.warn(`JavaScript-heavy content with low word count: ${url}`);
      throw new Error('JavaScript-heavy content, using fallback');
    }
    
    title = result.title || 'Untitled';
    estimatedWords = result.wordCount || 0;
    description = result.description || '';
    author = result.author || '';
    
    // Extract title
    const titleSelectors = config.selectors.title.split(',').map(s => s.trim());
    
    // Enhanced title extraction for Material Design docs
    const enhancedTitleSelectors = [
      '.md-header__topic .md-ellipsis', // Material Design header topic
      '.md-content h1', // Main content heading
      '.md-nav__link--active', // Active navigation item
      ...titleSelectors
    ];
    
    for (const selector of enhancedTitleSelectors) {
      try {
        const element = doc.querySelector(selector);
        if (element && element.textContent.trim()) {
          const titleText = element.textContent.trim();
          // Skip generic titles
          if (!isGenericTitle(titleText)) {
            title = titleText;
            break;
          }
        }
      } catch (e) {
        // Skip invalid selectors
      }
    }
    
    // Enhanced content extraction for Material Design docs
    const enhancedContentSelectors = [
      '.md-content__inner .md-typeset', // Material Design main content
      '.md-content article',
      ...config.selectors.content.split(',').map(s => s.trim())
    ];
    
    let bestContent = '';
    let maxWords = 0;
    
    for (const selector of enhancedContentSelectors) {
      try {
        const element = doc.querySelector(selector.trim());
        if (element) {
          const content = element.textContent || '';
          const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
          if (wordCount > maxWords) {
            maxWords = wordCount;
            bestContent = content;
          }
        }
      } catch (e) {
        // Skip invalid selectors
      }
    }
    
    if (maxWords > 0) {
      estimatedWords = maxWords;
      // Try to extract a description from the content
      const sentences = bestContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
      if (sentences.length > 0) {
        description = sentences[0].trim().substring(0, 200) + '...';
      }
    }
    
  } catch (defuddleError) {
    // Fallback to manual extraction if Defuddle fails
    console.warn(`Defuddle failed for ${url}, using fallback extraction:`, defuddleError);
    
    // Extract title
    const titleSelectors = config.selectors.title.split(',').map(s => s.trim());
    for (const selector of titleSelectors) {
      try {
        const element = doc.querySelector(selector);
        if (element && element.textContent.trim()) {
          title = element.textContent.trim();
          break;
        }
      } catch (e) {
        // Selector might not be valid
      }
    }
    
    // Estimate content length with better filtering
    const contentSelectors = config.selectors.content.split(',').map(s => s.trim());
    for (const selector of contentSelectors) {
      try {
        const element = doc.querySelector(selector);
        if (element) {
          // Remove script tags from content calculation
          const clonedElement = element.cloneNode(true);
          const scripts = clonedElement.querySelectorAll('script, style');
          scripts.forEach(script => script.remove());
          
          const text = clonedElement.textContent || '';
          const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
          estimatedWords = Math.max(estimatedWords, wordCount);
        }
      } catch (e) {
        // Selector might not be valid
      }
    }

    // If we still don't have enough content after fallback, reject the page
    if (estimatedWords < 50) {
      console.warn(`Insufficient content after fallback extraction (${estimatedWords} words): ${url}`);
      return null;
    }
  }
  
  // Final quality check - ensure we have substantial content
  if (estimatedWords < 50) {
    console.warn(`Final quality check failed (${estimatedWords} words): ${url}`);
    return null;
  }
  
  // Clean the title first
  const cleanedTitle = cleanTitle(title, url, config.name);
  
  // Extract URL path parts for breadcrumbs and priority
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  const fullPath = pathParts.join('/').toLowerCase();
  const titleLower = cleanedTitle.toLowerCase();
  
  // Determine priority from URL path and title
  let priority = 3;
  const allText = fullPath + ' ' + titleLower;
  
  if (allText.includes('welcome') || allText.includes('intro') || allText.includes('overview') || allText.includes('getting-started')) {
    priority = 1;
  } else if (allText.includes('guide') || allText.includes('tutorial') || allText.includes('concept') || allText.includes('how-to')) {
    priority = 2;
  }
  
  // Calculate depth based on path parts
  const depth = pathParts.length;
  
  // Generate tags from URL and title
  const tags = [];
  const tagText = (title + ' ' + urlObj.pathname).toLowerCase();
  
  if (tagText.includes('install')) tags.push('installation');
  if (tagText.includes('setup')) tags.push('setup');
  if (tagText.includes('config')) tags.push('configuration');
  if (tagText.includes('api')) tags.push('api');
  if (tagText.includes('tutorial')) tags.push('tutorial');
  if (tagText.includes('example')) tags.push('examples');
  if (tagText.includes('deploy')) tags.push('deployment');
  if (tagText.includes('test')) tags.push('testing');
  
  return {
    url,
    title: cleanedTitle,
    priority,
    estimatedWords, // Use actual word count, not minimum
    tags,
    description: description || `${cleanedTitle} - Documentation page`,
    author,
    breadcrumbs: pathParts,
    depth: depth
  };
}

/**
 * Discover entry points using navigation-based approach starting from seed URLs
 * @param {string} baseUrl - Base URL of the site
 * @param {Object} config - Site configuration
 * @returns {Promise<string[]>} Array of discovered entry points
 */
async function discoverEntryPoints(baseUrl, config) {
  console.log(`🧭 Navigation-based discovery for ${baseUrl}...`);
  
  const discoveredPaths = new Set();
  const navigationHierarchy = new Map(); // Track navigation relationships
  
  // Phase 1: Validate and analyze seed URLs
  if (!config.seedUrls || config.seedUrls.length === 0) {
    console.warn('No seed URLs provided, falling back to root discovery');
    return await fallbackDiscovery(baseUrl, config);
  }

  console.log(`🌱 Analyzing ${config.seedUrls.length} seed URLs...`);
  const validSeedPages = new Map(); // URL -> parsed document
  
  for (const seedUrl of config.seedUrls) {
    const fullUrl = baseUrl + (seedUrl.startsWith('/') ? seedUrl : '/' + seedUrl);
    try {
      const doc = await fetchPage(fullUrl);
      if (doc && hasValidContent(doc)) {
        discoveredPaths.add(seedUrl);
        validSeedPages.set(seedUrl, doc);
        console.log(`✓ Valid seed: ${seedUrl}`);
      } else {
        console.warn(`✗ Invalid seed: ${seedUrl}`);
      }
    } catch (error) {
      console.warn(`✗ Seed error ${seedUrl}:`, error.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (validSeedPages.size === 0) {
    console.warn('No valid seed URLs found, falling back to root discovery');
    return await fallbackDiscovery(baseUrl, config);
  }

  // Phase 2: Extract navigation structure from valid seed pages
  console.log(`🗺️ Mapping navigation structure from ${validSeedPages.size} seed pages...`);
  const navigationContext = await analyzeNavigationStructure(validSeedPages, baseUrl, config);
  
  // Phase 3: Discover sibling pages through navigation
  console.log(`🔗 Discovering siblings through navigation...`);
  const siblingPages = await discoverNavigationSiblings(navigationContext, baseUrl, config);
  
  for (const siblingPath of siblingPages) {
    discoveredPaths.add(siblingPath);
  }

  // Phase 4: Discover parent and child pages
  console.log(`👨‍👩‍👧‍👦 Discovering parent-child relationships...`);
  const familyPages = await discoverFamilyPages(navigationContext, baseUrl, config);
  
  for (const familyPath of familyPages) {
    discoveredPaths.add(familyPath);
  }

  const paths = Array.from(discoveredPaths);
  console.log(`🎯 Navigation discovery complete: ${paths.length} entry points`);
  
  // Sort by navigation importance rather than arbitrary scoring
  return sortByNavigationImportance(paths, navigationContext);
}

/**
 * Check if a document has valid content worth crawling
 */
function hasValidContent(doc) {
  const contentElements = doc.querySelectorAll(
    'main, article, .content, .markdown-body, .doc-content, .page-content, p, h1, h2, h3, h4, h5, h6'
  );
  const actualContent = Array.from(contentElements)
    .map(el => el.textContent || '')
    .join(' ')
    .trim();
  
  return actualContent.length > 50;
}

/**
 * Analyze navigation structure from seed pages
 */
async function analyzeNavigationStructure(validSeedPages, baseUrl, config) {
  const navigationContext = {
    primaryNavLinks: new Set(),
    sidebarLinks: new Set(),
    breadcrumbPaths: new Map(),
    sectionMappings: new Map(),
    seedUrls: new Set(validSeedPages.keys())
  };

  for (const [seedPath, doc] of validSeedPages) {
    // Extract primary navigation
    const primaryNav = extractPrimaryNavigation(doc, baseUrl, config);
    primaryNav.forEach(link => navigationContext.primaryNavLinks.add(link));

    // Extract sidebar navigation  
    const sidebarNav = extractSidebarNavigation(doc, baseUrl, config);
    sidebarNav.forEach(link => navigationContext.sidebarLinks.add(link));

    // Extract breadcrumbs for hierarchy understanding
    const breadcrumbs = extractBreadcrumbs(doc, baseUrl);
    if (breadcrumbs.length > 0) {
      navigationContext.breadcrumbPaths.set(seedPath, breadcrumbs);
    }

    // Determine section context for this seed
    const section = inferSectionFromPath(seedPath) || inferSectionFromNavigation(doc, seedPath);
    if (section) {
      if (!navigationContext.sectionMappings.has(section)) {
        navigationContext.sectionMappings.set(section, new Set());
      }
      navigationContext.sectionMappings.get(section).add(seedPath);
    }
  }

  return navigationContext;
}

/**
 * Extract primary navigation links
 */
function extractPrimaryNavigation(doc, baseUrl, config) {
  const links = new Set();
  
  // Primary navigation selectors in order of preference
  const primaryNavSelectors = [
    'nav[role="navigation"]:first-of-type a[href]',
    '.navbar-nav a[href]',
    '.main-nav a[href]', 
    '.primary-nav a[href]',
    'header nav a[href]',
    '.md-tabs a[href]', // Material Design
    'nav:first-of-type a[href]'
  ];

  for (const selector of primaryNavSelectors) {
    try {
      const navElements = doc.querySelectorAll(selector);
      if (navElements.length > 0) {
        navElements.forEach(link => {
          const href = link.getAttribute('href');
          if (href) {
            const absoluteUrl = resolveUrl(href, baseUrl);
            if (absoluteUrl && isValidUrl(absoluteUrl, baseUrl, config)) {
              links.add(new URL(absoluteUrl).pathname);
            }
          }
        });
        break; // Use first successful selector
      }
    } catch (e) {
      // Skip invalid selectors
    }
  }

  return links;
}

/**
 * Extract sidebar navigation links
 */
function extractSidebarNavigation(doc, baseUrl, config) {
  const links = new Set();
  
  const sidebarSelectors = [
    '.sidebar nav a[href]',
    '.docs-sidebar a[href]',
    '.toc a[href]',
    '.md-nav a[href]', // Material Design
    '.left-sidebar a[href]',
    '.doc-nav a[href]',
    '.side-nav a[href]'
  ];

  for (const selector of sidebarSelectors) {
    try {
      const sidebarElements = doc.querySelectorAll(selector);
      sidebarElements.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
          const absoluteUrl = resolveUrl(href, baseUrl);
          if (absoluteUrl && isValidUrl(absoluteUrl, baseUrl, config)) {
            links.add(new URL(absoluteUrl).pathname);
          }
        }
      });
    } catch (e) {
      // Skip invalid selectors
    }
  }

  return links;
}

/**
 * Extract breadcrumb navigation for hierarchy understanding
 */
function extractBreadcrumbs(doc, baseUrl) {
  const breadcrumbs = [];
  
  const breadcrumbSelectors = [
    '.breadcrumb a[href]',
    '.breadcrumbs a[href]',
    '[role="breadcrumb"] a[href]',
    '.md-nav__list--primary a[href]' // Material Design
  ];

  for (const selector of breadcrumbSelectors) {
    try {
      const breadcrumbElements = doc.querySelectorAll(selector);
      if (breadcrumbElements.length > 0) {
        breadcrumbElements.forEach(link => {
          const href = link.getAttribute('href');
          const text = link.textContent?.trim();
          if (href && text) {
            const absoluteUrl = resolveUrl(href, baseUrl);
            if (absoluteUrl) {
              breadcrumbs.push({
                path: new URL(absoluteUrl).pathname,
                title: text
              });
            }
          }
        });
        break; // Use first successful breadcrumb trail
      }
    } catch (e) {
      // Skip invalid selectors
    }
  }

  return breadcrumbs;
}

/**
 * Infer section from URL path
 */
function inferSectionFromPath(path) {
  const pathParts = path.split('/').filter(Boolean);
  if (pathParts.length > 0) {
    return pathParts[0]; // First path segment as section
  }
  return null;
}

/**
 * Infer section from navigation context
 */
function inferSectionFromNavigation(doc, currentPath) {
  // Look for active navigation items or current section indicators
  const activeSelectors = [
    '.nav-link.active',
    '.current',
    '.md-nav__link--active',
    '[aria-current="page"]'
  ];

  for (const selector of activeSelectors) {
    try {
      const activeElement = doc.querySelector(selector);
      if (activeElement) {
        const href = activeElement.getAttribute('href');
        if (href) {
          const section = inferSectionFromPath(href);
          if (section) return section;
        }
      }
    } catch (e) {
      // Skip invalid selectors
    }
  }

  return null;
}

/**
 * Discover sibling pages through navigation analysis
 */
async function discoverNavigationSiblings(navigationContext, baseUrl, config) {
  const siblings = new Set();

  // Find siblings from same-section navigation
  for (const [section, seedPaths] of navigationContext.sectionMappings) {
    console.log(`🔍 Finding siblings in section: ${section}`);
    
    // Get all navigation links that share this section
    const sectionLinks = new Set();
    
    // Check primary nav for section siblings
    for (const navLink of navigationContext.primaryNavLinks) {
      if (inferSectionFromPath(navLink) === section) {
        sectionLinks.add(navLink);
      }
    }
    
    // Check sidebar nav for section siblings
    for (const navLink of navigationContext.sidebarLinks) {
      if (inferSectionFromPath(navLink) === section) {
        sectionLinks.add(navLink);
      }
    }

    // Validate sibling links
    for (const siblingPath of sectionLinks) {
      if (!navigationContext.seedUrls.has(siblingPath)) {
        const fullUrl = baseUrl + siblingPath;
        try {
          const doc = await fetchPage(fullUrl);
          if (doc && hasValidContent(doc)) {
            siblings.add(siblingPath);
            console.log(`✓ Found sibling: ${siblingPath}`);
          }
        } catch (error) {
          console.warn(`✗ Sibling validation failed: ${siblingPath}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  return siblings;
}

/**
 * Discover parent and child pages through hierarchy analysis
 */
async function discoverFamilyPages(navigationContext, baseUrl, config) {
  const familyPages = new Set();

  // Use breadcrumbs to find parent pages
  for (const [seedPath, breadcrumbs] of navigationContext.breadcrumbPaths) {
    for (const breadcrumb of breadcrumbs) {
      if (!navigationContext.seedUrls.has(breadcrumb.path)) {
        const fullUrl = baseUrl + breadcrumb.path;
        try {
          const doc = await fetchPage(fullUrl);
          if (doc && hasValidContent(doc)) {
            familyPages.add(breadcrumb.path);
            console.log(`✓ Found parent: ${breadcrumb.path}`);
          }
        } catch (error) {
          console.warn(`✗ Parent validation failed: ${breadcrumb.path}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  return familyPages;
}

/**
 * Sort paths by navigation importance
 */
function sortByNavigationImportance(paths, navigationContext) {
  return paths.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    // Seed URLs get highest priority
    if (navigationContext.seedUrls.has(a)) scoreA += 10;
    if (navigationContext.seedUrls.has(b)) scoreB += 10;

    // Primary navigation gets high priority
    if (navigationContext.primaryNavLinks.has(a)) scoreA += 5;
    if (navigationContext.primaryNavLinks.has(b)) scoreB += 5;

    // Sidebar navigation gets medium priority
    if (navigationContext.sidebarLinks.has(a)) scoreA += 3;
    if (navigationContext.sidebarLinks.has(b)) scoreB += 3;

    // Shorter paths get slight priority (likely more important)
    scoreA += (5 - a.split('/').length);
    scoreB += (5 - b.split('/').length);

    return scoreB - scoreA;
  });
}

/**
 * Fallback discovery when no seed URLs are available
 */
async function fallbackDiscovery(baseUrl, config) {
  console.log('🔄 Fallback: discovering from root page');
  const discoveredPaths = new Set();
  
  // Try root page first
  try {
    const rootDoc = await fetchPage(baseUrl);
    if (rootDoc && hasValidContent(rootDoc)) {
      discoveredPaths.add('/');
      
      // Extract navigation from root
      const primaryNav = extractPrimaryNavigation(rootDoc, baseUrl, config);
      const sidebarNav = extractSidebarNavigation(rootDoc, baseUrl, config);
      
      // Validate up to 5 navigation links
      const navLinks = [...primaryNav, ...sidebarNav].slice(0, 5);
      for (const navPath of navLinks) {
        const fullUrl = baseUrl + navPath;
        try {
          const doc = await fetchPage(fullUrl);
          if (doc && hasValidContent(doc)) {
            discoveredPaths.add(navPath);
            console.log(`✓ Navigation fallback: ${navPath}`);
          }
        } catch (error) {
          console.warn(`✗ Navigation fallback failed: ${navPath}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
  } catch (error) {
    console.error('Root page fallback failed:', error.message);
  }

  return Array.from(discoveredPaths);
}

/**
 * Clean and normalize page titles for better display
 * @param {string} title - Raw title from page
 * @param {string} url - Page URL for fallback title generation
 * @param {string} siteName - Name of the site being crawled
 * @returns {string} Cleaned title
 */
function cleanTitle(title, url, siteName = '') {
  if (!title || title.trim() === '') {
    // Generate title from URL if no title found
    return generateTitleFromUrl(url);
  }
  
  let cleaned = title.trim();
  
  // Remove common site name suffixes/prefixes
  const sitePatterns = [
    /\s*[-|]\s*(Documentation|Docs|Guide|Tutorial|Help|Support)\s*$/i,
    /^(Documentation|Docs|Guide|Tutorial|Help|Support)\s*[-|]\s*/i,
    /\s*[-|]\s*HyperBEAM\s*$/i,
    /^HyperBEAM\s*[-|]\s*/i,
    /\s*[-|]\s*Arweave\s*$/i,
    /^Arweave\s*[-|]\s*/i,
    /\s*[-|]\s*AO\s*$/i,
    /^AO\s*[-|]\s*/i,
    /\s*[-|]\s*ARIO\s*$/i,
    /^ARIO\s*[-|]\s*/i
  ];
  
  // Remove site-specific patterns
  for (const pattern of sitePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove generic suffixes
  const genericPatterns = [
    /\s*[-|]\s*Home\s*$/i,
    /\s*[-|]\s*Index\s*$/i,
    /\s*[-|]\s*Main\s*$/i,
    /\s*[-|]\s*Page\s*$/i
  ];
  
  for (const pattern of genericPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Clean up extra whitespace and separators
  cleaned = cleaned.replace(/\s*[-|•·]\s*$/, ''); // Remove trailing separators
  cleaned = cleaned.replace(/^\s*[-|•·]\s*/, ''); // Remove leading separators
  cleaned = cleaned.replace(/\s+/g, ' ').trim(); // Normalize whitespace
  
  // If title is still generic or too short, try to improve it
  if (isGenericTitle(cleaned)) {
    const urlTitle = generateTitleFromUrl(url);
    if (urlTitle && urlTitle !== cleaned) {
      return urlTitle;
    }
  }
  
  // Capitalize first letter if needed
  if (cleaned && cleaned[0] === cleaned[0].toLowerCase()) {
    cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned || generateTitleFromUrl(url);
}

/**
 * Check if a title is too generic to be useful
 * @param {string} title - Title to check
 * @returns {boolean} True if title is generic
 */
function isGenericTitle(title) {
  if (!title || title.length < 3) return true;
  
  const genericTitles = [
    'documentation', 'docs', 'guide', 'tutorial', 'help', 'support',
    'home', 'index', 'main', 'page', 'welcome', 'intro', 'introduction',
    'getting started', 'get started', 'start', 'overview', 'about'
  ];
  
  const titleLower = title.toLowerCase().trim();
  return genericTitles.includes(titleLower);
}

/**
 * Generate a readable title from URL path
 * @param {string} url - URL to generate title from
 * @returns {string} Generated title
 */
function generateTitleFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    
    // Remove leading/trailing slashes and get last meaningful segment
    const segments = path.split('/').filter(seg => seg && seg.length > 0);
    
    if (segments.length === 0) {
      return 'Home';
    }
    
    // Use the last segment, or second-to-last if last is generic
    let segment = segments[segments.length - 1];
    
    // If last segment is generic or a file extension, try previous
    if (segment.match(/\.(html?|php|aspx?)$/i) || 
        ['index', 'default', 'main', 'home'].includes(segment.toLowerCase())) {
      if (segments.length > 1) {
        segment = segments[segments.length - 2];
      }
    }
    
    // Clean up the segment
    segment = segment.replace(/\.(html?|php|aspx?)$/i, ''); // Remove file extensions
    segment = segment.replace(/[-_]/g, ' '); // Replace dashes/underscores with spaces
    segment = segment.replace(/\b\w/g, l => l.toUpperCase()); // Title case
    
    return segment;
  } catch (error) {
    return 'Untitled Page';
  }
}

/**
 * Crawl a single site dynamically with enhanced telemetry and monitoring
 * @param {string} siteKey - Site identifier
 * @param {Object} options - Options object with callbacks and limits
 * @returns {Promise<Object>} Crawl results
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
    onError = () => {}
  } = options;
  
  const visited = new Set();
  const seen = new Set(); // Active deduplication during crawling
  const pages = [];
  const stack = []; // Use stack for DFS instead of queue for BFS
  const errors = [];
  const telemetry = {
    startTime: Date.now(),
    requestCount: 0,
    bytesDownloaded: 0,
    averageResponseTime: 0,
    gatewayUsage: new Map(),
    errorsByType: new Map(),
  };
  
  console.log(`🚀 Starting crawl of ${config.name}`);
  console.log(`📊 Limits: ${maxDepth} depth, ${maxPages} pages`);
  console.log(`🎯 Rate limit: 2 req/sec with burst of 5`);
  
  // Initialize Wayfinder for this crawl session
  const wayfinder = await initializeWayfinder();
  let resolvedBaseUrl = config.baseUrl;

  // Try to find a faster gateway using Wayfinder if available
  if (wayfinder && config.baseUrl.startsWith('https://')) {
    try {
      // Extract the likely ArNS name from the hostname
      const hostname = new URL(config.baseUrl).hostname;
      let arnsName = null;
      
      // Map known hostnames to their ArNS names
      const hostnameToArns = {
        'cookbook_ao.arweave.net': 'ao-cookbook',
        'cookbook.arweave.net': 'arweave-cookbook', 
        'docs.ar.io': 'docs-ar-io',
        'hyperbeam.arweave.net': 'hyperbeam'
      };
      
      arnsName = hostnameToArns[hostname];
      
      if (arnsName) {
        console.log(`🔍 Attempting to find faster gateway for ar://${arnsName}...`);
        const fullResolvedUrl = await wayfinder.resolveUrl({ originalUrl: `ar://${arnsName}` });
        const fasterGateway = new URL(fullResolvedUrl).origin;
        
        // Only switch if we got a different gateway
        if (fasterGateway !== new URL(config.baseUrl).origin) {
          resolvedBaseUrl = fasterGateway;
          console.log(`🚀 Using faster gateway: ${resolvedBaseUrl} (was ${config.baseUrl})`);
        } else {
          console.log(`✅ Current gateway is already optimal: ${config.baseUrl}`);
        }
      } else {
        console.log(`🌐 No ArNS mapping found for ${hostname}, using original URL`);
      }
    } catch (error) {
      console.warn(`⚠️ Wayfinder gateway resolution failed, using original URL:`, error.message);
      // Continue with original URL - this is not a fatal error
    }
  } else {
    console.log(`🌐 Using configured baseUrl: ${resolvedBaseUrl}`);
  }
  
  // Discover entry points dynamically
  const discoveredPaths = await discoverEntryPoints(resolvedBaseUrl, config);
  
  if (discoveredPaths.length === 0) {
    console.warn(`No entry points discovered for ${config.name}, falling back to root`);
    discoveredPaths.push('/');
  }
  
  // Initialize stack with discovered entry points (DFS order - last in, first out)
  const entryPointsToUse = discoveredPaths.slice(0, Math.min(6, discoveredPaths.length));
  console.log(`🌱 Seeds: ${entryPointsToUse.length}`);
  
  for (const entryPoint of entryPointsToUse.reverse()) { // Reverse for proper DFS order
    const url = resolvedBaseUrl + (entryPoint.startsWith('/') ? entryPoint : '/' + entryPoint);
    if (!seen.has(url)) {
      stack.push({ url, depth: 0 });
      seen.add(url);
    }
  }
  
  console.log(`Starting DFS crawl of ${config.name}...`);
  
  while (stack.length > 0 && pages.length < maxPages) {
    const { url, depth } = stack.pop(); // DFS: pop from end
    
    if (visited.has(url) || depth > maxDepth) {
      continue;
    }
    
    visited.add(url);
    onProgress(pages.length + 1, maxPages, url);
    
    try {
      const requestStart = Date.now();
      const doc = await fetchPage(url);
      const requestTime = Date.now() - requestStart;
      
      // Update telemetry
      telemetry.requestCount++;
      telemetry.averageResponseTime = (
        (telemetry.averageResponseTime * (telemetry.requestCount - 1) + requestTime) / 
        telemetry.requestCount
      );
      
      if (!doc) {
        const error = 'Failed to fetch page';
        errors.push({ url, error, depth, timestamp: new Date().toISOString() });
        telemetry.errorsByType.set('fetch_failed', 
          (telemetry.errorsByType.get('fetch_failed') || 0) + 1);
        onError(url, error);
        continue;
      }
      
      // Extract page metadata
      const pageData = extractPageMetadata(doc, url, config);
      if (!pageData) {
        console.warn(`Page rejected by quality filters: ${url}`);
        telemetry.errorsByType.set('quality_rejected', 
          (telemetry.errorsByType.get('quality_rejected') || 0) + 1);
        continue;
      }
      
      pages.push({
        ...pageData,
        siteKey,
        siteName: config.name,
        depth,
        crawledAt: new Date().toISOString(),
        crawlStats: {
          responseTime: requestTime,
          depth: depth
        }
      });
      
      console.log(`📄 [${pages.length}/${maxPages}] ${pageData.title} (${pageData.estimatedWords} words, ${requestTime}ms)`);
      
      // Extract links and discover sister pages (only if we have capacity)
      if (pages.length < maxPages && depth < maxDepth) {
        const links = extractLinks(doc, resolvedBaseUrl, config, url);
        
        // Sister page discovery disabled to prevent false 404s
        let sisterUrls = [];
        // Note: Sister page discovery was generating hundreds of invalid URLs
        // from arbitrary vocabulary words, causing performance issues
        
        // Combine regular links with sister pages
        const allLinks = [...links, ...sisterUrls];
        
        // Add new links to stack (DFS: deeper first, with active deduplication)
        const newLinks = [];
        for (const link of allLinks) {
          if (!seen.has(link)) {
            seen.add(link);
            newLinks.push({ url: link, depth: depth + 1 });
          }
        }
        
        // Add to stack in reverse order so first discovered gets processed first
        for (const linkData of newLinks.reverse()) {
          stack.push(linkData);
        }
        
        console.log(`🔗 Found ${links.length} links -> ${newLinks.length} new URLs to crawl`);
      }
      
      // Rate limiting is now handled by the RateLimiter class in fetchPage
      
    } catch (error) {
      console.error(`❌ Error crawling ${url}:`, error.message);
      const errorMsg = error.message;
      const errorType = error.name || 'unknown_error';
      
      errors.push({ 
        url, 
        error: errorMsg, 
        errorType,
        depth, 
        timestamp: new Date().toISOString() 
      });
      
      telemetry.errorsByType.set(errorType, 
        (telemetry.errorsByType.get(errorType) || 0) + 1);
      
      onError(url, errorMsg);
    }
  }
  
  const crawlDuration = Date.now() - telemetry.startTime;
  
  console.log(`✅ Crawl complete: ${pages.length} pages, ${errors.length} errors`);
  console.log(`📊 Deduplication: ${seen.size} URLs seen, ${visited.size} visited`);
  console.log(`⏱️ Duration: ${(crawlDuration / 1000).toFixed(1)}s, Avg response: ${telemetry.averageResponseTime.toFixed(0)}ms`);
  console.log(`📈 Rate: ${(telemetry.requestCount / (crawlDuration / 1000)).toFixed(2)} req/sec`);
  
  // Log error breakdown
  if (telemetry.errorsByType.size > 0) {
    console.log(`❌ Error breakdown:`);
    for (const [type, count] of telemetry.errorsByType.entries()) {
      console.log(`   - ${type}: ${count}`);
    }
  }
  
  // Simplified filtering - less aggressive since we have better deduplication
  const filteredPages = pages.filter(page => {
    // Basic quality check only
    if (page.estimatedWords < 30) {
      console.warn(`Filtering very low content: ${page.url} (${page.estimatedWords} words)`);
      return false;
    }
    return true;
  });
  
  console.log(`📋 Final result: ${filteredPages.length} quality pages`);
  
  return {
    siteKey,
    name: config.name,
    baseUrl: config.baseUrl,
    results: filteredPages,
    pages: filteredPages,
    errors,
    stats: {
      totalPages: filteredPages.length,
      totalErrors: errors.length,
      maxDepthReached: Math.max(...filteredPages.map(p => p.depth), 0),
      urlsSeen: seen.size,
      urlsVisited: visited.size,
      crawlDuration,
      averageResponseTime: telemetry.averageResponseTime,
      requestRate: telemetry.requestCount / (crawlDuration / 1000),
      errorsByType: Object.fromEntries(telemetry.errorsByType)
    },
    telemetry: {
      startTime: new Date(telemetry.startTime).toISOString(),
      endTime: new Date().toISOString(),
      duration: crawlDuration,
      requestCount: telemetry.requestCount,
      averageResponseTime: telemetry.averageResponseTime,
      requestRate: telemetry.requestCount / (crawlDuration / 1000),
      errorsByType: Object.fromEntries(telemetry.errorsByType)
    },
    crawledAt: new Date().toISOString()
  };
}

/**
 * Crawl all configured sites
 * @param {Function} progressCallback - Progress callback (siteKey, current, total, url)
 * @returns {Promise<Object>} All crawl results
 */
export async function crawlAllSites(progressCallback = () => {}) {
  const configs = await loadCrawlConfigs();
  const results = {};
  const siteKeys = Object.keys(configs);
  
  for (let i = 0; i < siteKeys.length; i++) {
    const siteKey = siteKeys[i];
    
    try {
      results[siteKey] = await crawlSite(siteKey, (current, total, url) => {
        progressCallback(siteKey, current, total, url);
      });
    } catch (error) {
      console.error(`Failed to crawl ${siteKey}:`, error);
      results[siteKey] = {
        siteKey,
        name: configs[siteKey].name,
        error: error.message,
        pages: [],
        errors: [{ error: error.message }]
      };
    }
  }
  
  return results;
}

/**
 * Build display tree from crawled pages
 * @param {Object} crawlResults - Results from crawlAllSites
 * @returns {Object} Display tree structure optimized for breadcrumb display
 */
export function buildDisplayTree(crawlResults) {
  const tree = {};
  
  for (const [siteKey, siteData] of Object.entries(crawlResults)) {
    if (siteData.error) {
      tree[siteKey] = {
        name: siteData.name,
        error: siteData.error,
        pages: []
      };
      continue;
    }
    
    // Sort pages by breadcrumb path for better organization
    const sortedPages = siteData.pages.sort((a, b) => {
      const pathA = a.breadcrumbs ? a.breadcrumbs.join('/') : '';
      const pathB = b.breadcrumbs ? b.breadcrumbs.join('/') : '';
      return pathA.localeCompare(pathB);
    });
    
    tree[siteKey] = {
      name: siteData.name,
      description: `${siteData.pages.length} pages discovered`,
      pages: sortedPages,
      crawledAt: siteData.crawledAt
    };
  }
  
  return tree;
}

/**
 * Get all crawl configurations
 * @returns {Promise<Object>} All site configurations
 */
export async function getCrawlConfigs() {
  return await loadCrawlConfigs();
}

/**
 * CLI entry point for Node.js crawling
 */
export async function runCrawl() {
  if (typeof window !== 'undefined') {
    throw new Error('CLI crawl should only run in Node.js environment');
  }
  
  const fs = await import('fs/promises');
  
  console.log('🕷️ Starting documentation crawl...');
  
  const results = await crawlAllSites((siteKey, current, total, url) => {
    console.log(`[${siteKey}] ${current}/${total} - ${url}`);
  });
  
  const displayTree = buildDisplayTree(results);
  
  // Add metadata
  const finalData = {
    ...displayTree,
    _metadata: {
      crawledAt: new Date().toISOString(),
      version: '1.0',
      totalSites: Object.keys(displayTree).length,
      totalPages: Object.values(displayTree).reduce((sum, site) => sum + (site.pages?.length || 0), 0)
    }
  };
  
  // Ensure public directory exists
  await fs.mkdir('public', { recursive: true });
  
  // Write to public directory for static hosting
  await fs.writeFile('public/docs-index.json', JSON.stringify(finalData, null, 2));
  
  console.log('✅ Crawl completed successfully!');
  console.log(`📊 Total sites: ${finalData._metadata.totalSites}`);
  console.log(`📄 Total pages: ${finalData._metadata.totalPages}`);
  console.log(`💾 Output: public/docs-index.json`);
}

// Run if called directly
if (typeof window === 'undefined') {
  // Check if this file is being run directly
  const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                       process.argv[1]?.endsWith('crawler.js') ||
                       process.argv[1]?.endsWith('src/utils/crawler.js');
  
  if (isMainModule) {
    runCrawl().catch(console.error);
  }
}

function inferPattern(filenames) {
  if (filenames.length < 2) return null;
  
  let prefix = '';
  for (let i = 0; i < filenames[0].length; i++) {
    const char = filenames[0][i];
    if (filenames.every(name => name[i] === char)) {
      prefix += char;
    } else {
      break;
    }
  }
  
  let suffix = '';
  for (let i = 1; i <= filenames[0].length; i++) {
    const char = filenames[0][filenames[0].length - i];
    if (filenames.every(name => name[name.length - i] === char)) {
      suffix = char + suffix;
    } else {
      break;
    }
  }
  
  // Basic sanity check for a valid pattern
  if (prefix.length + suffix.length >= filenames[0].length) {
    return null;
  }
  
  return { prefix, suffix };
}

function extractVocabulary(doc, config) {
  const content = extractTextContent(doc, config);
  const stopWords = new Set(['and', 'or', 'the', 'a', 'an', 'in', 'is', 'it', 'of', 'for', 'on', 'to', 'with', 'as', 'by', 'that', 'this', 'how', 'what', 'when', 'where', 'why']);
  
  return [...new Set(
    content
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
  )];
}

function extractTextContent(doc, config) {
  // Try content selectors first
  const contentSelectors = config.selectors.content.split(',').map(s => s.trim());
  
  for (const selector of contentSelectors) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        return element.textContent.trim();
      }
    } catch (e) {
      // Skip invalid selectors
    }
  }
  
  // Fallback to body content
  return doc.body?.textContent?.trim() || '';
}

async function discoverSisterPages(doc, currentUrl, existingLinks, config) {
  // Disable sister page discovery to eliminate false 404s
  // This was generating hundreds of invalid URLs by combining arbitrary vocabulary
  // with filename patterns, causing massive performance issues
  
  console.log(`Sister page discovery disabled for: ${currentUrl}`);
  return [];
}

// Sister page validation no longer needed since discovery is disabled
async function validateSisterPages(sisterUrls, maxConcurrent = 5) {
  // Sister page discovery is disabled, so this always returns empty array
  return [];
} 