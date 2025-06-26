/**
 * Dynamic browser-based crawler for Permaweb documentation sites
 * Discovers pages by following links and analyzing site structures
 */

import { JSDOM } from 'jsdom';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import Defuddle from 'defuddle';

// Cache for loaded configuration
let crawlConfigs = null;

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
 * Fetch and parse HTML content using HyperBEAM relay to bypass CORS
 * @param {string} url - URL to fetch
 * @returns {Promise<Document|null>} Parsed DOM document or null if failed
 */
async function fetchPage(url) {
  try {
    // Try direct fetch first
    let response;
    let html;
    
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        mode: 'cors'
      });
      
      if (response.ok) {
        html = await response.text();
      } else {
        console.warn(`HTTP ${response.status} for ${url}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
    } catch (corsError) {
      // If CORS fails, use HyperBEAM relay service
      console.warn(`CORS failed for ${url}, using HyperBEAM relay...`);
      
      const relayUrl = `https://router-1.forward.computer/~relay@1.0/call?relay-path=${encodeURIComponent(url)}&relay-method=GET`;
      
      response = await fetch(relayUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      if (!response.ok) {
        console.warn(`Relay HTTP ${response.status} for ${url}`);
        throw new Error(`Relay failed with HTTP ${response.status}: ${response.statusText}`);
      }
      
      html = await response.text();
    }

    // Enhanced 404 detection
    if (html.includes('404') && (html.includes('not found') || html.includes('Not Found') || html.includes('NOT FOUND'))) {
      console.warn(`404 page detected: ${url}`);
      return null;
    }

    // Check for modern 404 pages with specific content
    if (html.includes('404s suck!') || html.includes('Our vision is an internet with no more 404s')) {
      console.warn(`Modern 404 page detected: ${url}`);
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
    
    // Additional 404 check in parsed content
    const bodyText = doc.body?.textContent?.toLowerCase() || '';
    if (bodyText.includes('404') && bodyText.includes('not found')) {
      console.warn(`404 content detected: ${url}`);
      return null;
    }

    // Check for modern 404 page content
    if (bodyText.includes('404s suck') || bodyText.includes('vision is an internet with no more 404s')) {
      console.warn(`Modern 404 page content detected: ${url}`);
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
  
  // Combine all selectors into one array for simplicity
  const allSelectors = [
    ...config.selectors.navigation.split(','),
    ...config.selectors.content.split(',')
  ].map(s => s.trim()).filter(s => s.length > 0);

  for (const selector of allSelectors) {
    try {
      const elements = doc.querySelectorAll(selector);
      elements.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
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
  
  // Fallback if selectors find very few links
  if (links.size < 5) {
    const fallbackLinks = doc.querySelectorAll('a[href]');
    fallbackLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
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
    
    // Enhanced validation for documentation pages
    const isDocumentationUrl = (
      path.endsWith('/') ||
      path.endsWith('.html') ||
      path.endsWith('.md') ||
      path.includes('/docs/') ||
      path.includes('/build/') ||
      path.includes('/guides/') ||
      path.includes('/tutorials/') ||
      path.includes('/reference/') ||
      path.includes('/api/') ||
      path.includes('/concepts/') ||
      path.includes('/getting-started/') ||
      // Accept paths that look like documentation sections
      /\/[a-zA-Z0-9-_]+\/$/.test(path) ||
      // Accept paths with common documentation patterns
      /\/(introduction|overview|quickstart|installation|setup|configuration|advanced|examples|troubleshooting|faq|glossary)/i.test(path)
    );
    
    // For HyperBEAM specifically, accept any path that passed the exclusion filters
    if (baseUrl.includes('hyperbeam.arweave.net')) {
      return path.length > 1;
    }
    
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
 * Discover potential entry points for a site by analyzing navigation and common patterns
 * @param {string} baseUrl - Base URL of the site
 * @param {Object} config - Site configuration
 * @returns {Promise<string[]>} Array of discovered entry points
 */
async function discoverEntryPoints(baseUrl, config) {
  console.log(`Discovering entry points for ${baseUrl}...`);
  
  const discoveredPaths = new Set();
  
  // Start with seed URLs if provided
  if (config.seedUrls && config.seedUrls.length > 0) {
    console.log(`Testing ${config.seedUrls.length} seed URLs...`);
    for (const seedUrl of config.seedUrls) {
      const testUrl = baseUrl + (seedUrl.startsWith('/') ? seedUrl : '/' + seedUrl);
      try {
        const doc = await fetchPage(testUrl);
        if (doc) {
          // Additional validation - make sure the page has actual content
          const contentElements = doc.querySelectorAll('main, article, .content, .markdown-body, .doc-content, .page-content, p, h1, h2, h3, h4, h5, h6');
          const actualContent = Array.from(contentElements).map(el => el.textContent || '').join(' ').trim();
          
          if (actualContent.length > 50) { // Lower threshold for seed URLs
            discoveredPaths.add(seedUrl);
            console.log(`✓ Seed URL found: ${seedUrl}`);
          } else {
            console.warn(`✗ Rejected seed URL ${seedUrl}: insufficient content (${actualContent.length} chars)`);
          }
        } else {
          console.warn(`✗ Seed URL failed to fetch: ${seedUrl}`);
        }
      } catch (error) {
        console.warn(`✗ Seed URL ${seedUrl} error:`, error.message);
      }
      
      // Small delay to be respectful during discovery
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
  
  // Then try common documentation patterns
  const commonPatterns = [
    '/', // Always start with root
    '/docs',
    '/documentation', 
    '/guide', '/guides',
    '/tutorial', '/tutorials',
    '/getting-started', '/get-started', '/start',
    '/reference', '/references', '/ref',
    '/developers', '/dev',
    '/concepts', '/fundamentals',
    '/learn', '/learning',
    '/build', '/building',
    '/run', '/running',
    '/setup', '/install', '/installation',
    '/welcome', '/intro', '/introduction',
    '/examples', '/demos',
    '/help', '/support',
    '/faq', '/troubleshooting'
  ];

  console.log(`Testing ${commonPatterns.length} common patterns...`);
  for (const pattern of commonPatterns) {
    // Skip if we already found this pattern in seed URLs
    if (discoveredPaths.has(pattern)) {
      continue;
    }
    
    const testUrl = baseUrl + pattern;
    try {
      const doc = await fetchPage(testUrl);
      if (doc) {
        // Additional validation - make sure the page has actual content
        const contentElements = doc.querySelectorAll('main, article, .content, .markdown-body, .doc-content, .page-content, p, h1, h2, h3, h4, h5, h6');
        const actualContent = Array.from(contentElements).map(el => el.textContent || '').join(' ').trim();
        
        if (actualContent.length > 100) { // Ensure there's substantial content
          discoveredPaths.add(pattern);
          console.log(`✓ Found common pattern: ${pattern}`);
        } else {
          console.warn(`✗ Rejected ${pattern}: insufficient content`);
        }
      }
    } catch (error) {
      // Pattern doesn't exist, continue
    }
    
    // Small delay to be respectful during discovery
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // If we found the root, analyze it for navigation links
  if (discoveredPaths.has('/')) {
    try {
      const rootDoc = await fetchPage(baseUrl);
      if (rootDoc) {
        // Extract navigation links
        const navLinks = extractLinks(rootDoc, baseUrl, config, baseUrl);
        
        // Score and filter navigation links
        for (const link of navLinks) {
          const path = new URL(link).pathname;
          const score = scoreDocumentationPath(path);
          
          if (score > 0.3) { // Only include paths with decent documentation potential
            // Additional validation for navigation links
            try {
              const linkDoc = await fetchPage(link);
              if (linkDoc) {
                const contentElements = linkDoc.querySelectorAll('main, article, .content, .markdown-body, p, h1, h2, h3, h4, h5, h6');
                const actualContent = Array.from(contentElements).map(el => el.textContent || '').join(' ').trim();
                
                if (actualContent.length > 100) {
                  discoveredPaths.add(path);
                  console.log(`✓ Navigation link: ${path} (score: ${score.toFixed(2)})`);
                } else {
                  console.warn(`✗ Rejected navigation link ${path}: insufficient content`);
                }
              }
            } catch (error) {
              console.warn(`Failed to validate navigation link ${path}:`, error.message);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to analyze root page for navigation:', error.message);
    }
  }

  // Check for sitemap.xml
  try {
    const sitemapUrl = baseUrl + '/sitemap.xml';
    const response = await fetch(sitemapUrl);
    if (response.ok) {
      const sitemapText = await response.text();
      const parser = new DOMParser();
      const sitemapDoc = parser.parseFromString(sitemapText, 'application/xml');
      
      const urls = sitemapDoc.querySelectorAll('url loc');
      for (const urlElement of urls) {
        const fullUrl = urlElement.textContent;
        if (fullUrl && fullUrl.startsWith(baseUrl)) {
          const path = new URL(fullUrl).pathname;
          const score = scoreDocumentationPath(path);
          if (score > 0.4) {
            discoveredPaths.add(path);
            console.log(`✓ Sitemap: ${path} (score: ${score.toFixed(2)})`);
          }
        }
      }
    }
  } catch (error) {
    // No sitemap or failed to parse, continue
  }

  const paths = Array.from(discoveredPaths);
  console.log(`Discovered ${paths.length} potential entry points`);
  
  // Sort by documentation score (most promising first)
  return paths.sort((a, b) => scoreDocumentationPath(b) - scoreDocumentationPath(a));
}

/**
 * Score a URL path based on how likely it is to contain documentation
 * @param {string} path - URL path to score
 * @returns {number} Score from 0 (unlikely) to 1 (very likely)
 */
function scoreDocumentationPath(path) {
  if (!path || path === '/') return 0.8; // Root is usually important
  
  const pathLower = path.toLowerCase();
  let score = 0;
  
  // High-value documentation keywords
  const highValue = ['docs', 'documentation', 'guide', 'tutorial', 'getting-started', 'reference', 'api'];
  const mediumValue = ['learn', 'build', 'concepts', 'fundamentals', 'examples', 'help'];
  const lowValue = ['about', 'intro', 'welcome', 'setup', 'install', 'faq'];
  
  // Check for high-value keywords
  for (const keyword of highValue) {
    if (pathLower.includes(keyword)) {
      score += 0.3;
    }
  }
  
  // Check for medium-value keywords  
  for (const keyword of mediumValue) {
    if (pathLower.includes(keyword)) {
      score += 0.2;
    }
  }
  
  // Check for low-value keywords
  for (const keyword of lowValue) {
    if (pathLower.includes(keyword)) {
      score += 0.1;
    }
  }
  
  // Penalize very long or complex paths
  const depth = path.split('/').length - 1;
  if (depth > 3) score -= 0.1;
  if (depth > 5) score -= 0.2;
  
  // Boost shorter, cleaner paths
  if (depth === 1 && pathLower.match(/^\/[a-z-]+$/)) {
    score += 0.1;
  }
  
  return Math.max(0, Math.min(1, score));
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
 * Crawl a single site dynamically
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
  
  console.log(`🚀 Starting crawl of ${config.name}`);
  console.log(`📊 Limits: ${maxDepth} depth, ${maxPages} pages`);
  
  // Discover entry points dynamically
  const discoveredPaths = await discoverEntryPoints(config.baseUrl, config);
  
  if (discoveredPaths.length === 0) {
    console.warn(`No entry points discovered for ${config.name}, falling back to root`);
    discoveredPaths.push('/');
  }
  
  // Initialize stack with discovered entry points (DFS order - last in, first out)
  const entryPointsToUse = discoveredPaths.slice(0, Math.min(6, discoveredPaths.length));
  console.log(`🌱 Seeds: ${entryPointsToUse.length}`);
  
  for (const entryPoint of entryPointsToUse.reverse()) { // Reverse for proper DFS order
    const url = config.baseUrl + (entryPoint.startsWith('/') ? entryPoint : '/' + entryPoint);
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
      const doc = await fetchPage(url);
      if (!doc) {
        const error = 'Failed to fetch page';
        errors.push({ url, error });
        onError(url, error);
        continue;
      }
      
      // Extract page metadata
      const pageData = extractPageMetadata(doc, url, config);
      if (!pageData) {
        console.warn(`Page rejected by quality filters: ${url}`);
        continue;
      }
      
      pages.push({
        ...pageData,
        siteKey,
        siteName: config.name,
        depth
      });
      
      // Extract links and discover sister pages (only if we have capacity)
      if (pages.length < maxPages && depth < maxDepth) {
        const links = extractLinks(doc, config.baseUrl, config, url);
        
        // Auto-discover sister pages for deepest pages (DFS naturally prioritizes deeper pages)
        let sisterUrls = [];
        if (depth >= 1) { // Only discover sister pages for non-root pages
          sisterUrls = await discoverSisterPages(doc, url, links, config);
          const validSisterUrls = await validateSisterPages(sisterUrls);
          sisterUrls = validSisterUrls;
        }
        
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
        
        console.log(`📄 ${url} -> ${links.length} links + ${sisterUrls.length} sister pages (${newLinks.length} new)`);
      }
      
      // Small delay to be respectful (reduced for efficiency)
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Error crawling ${url}:`, error);
      const errorMsg = error.message;
      errors.push({ url, error: errorMsg });
      onError(url, errorMsg);
    }
  }
  
  console.log(`✅ Crawl complete: ${pages.length} pages, ${errors.length} errors`);
  console.log(`📊 Deduplication: ${seen.size} URLs seen, ${visited.size} visited`);
  
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
      urlsVisited: visited.size
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
  const discovered = new Set();
  const urlObj = new URL(currentUrl);
  const currentDir = urlObj.href.substring(0, urlObj.href.lastIndexOf('/') + 1);

  // Only look for sister pages in the same directory
  const peerLinks = existingLinks.filter(link => link.startsWith(currentDir));
  if (peerLinks.length < 2) return []; // Need at least 2 peer links to infer pattern

  const peerFilenames = peerLinks.map(link => link.substring(link.lastIndexOf('/') + 1));
  const pattern = inferPattern(peerFilenames);

  if (!pattern) return []; // No clear pattern found
  
  // Get vocabulary from page content (limit to avoid too many candidates)
  const vocabulary = extractVocabulary(doc, config).slice(0, 20); // Limit to top 20 words
  
  // Generate candidate URLs based on pattern and vocabulary
  for (const word of vocabulary) {
    const candidateFilename = `${pattern.prefix}${word}${pattern.suffix}`;
    const candidateUrl = `${currentDir}${candidateFilename}`;
    
    // Only add if not already in existing links and looks reasonable
    if (!existingLinks.includes(candidateUrl) && word.length >= 3 && word.length <= 15) {
      discovered.add(candidateUrl);
    }
  }
  
  return [...discovered].slice(0, 10); // Limit to top 10 candidates
}

// Enhanced sister page validation
async function validateSisterPages(sisterUrls, maxConcurrent = 5) {
  const validUrls = [];
  
  // Process in batches to avoid overwhelming the server
  for (let i = 0; i < sisterUrls.length; i += maxConcurrent) {
    const batch = sisterUrls.slice(i, i + maxConcurrent);
    const results = await Promise.allSettled(
      batch.map(async url => {
        try {
          const response = await fetch(url, {
            method: 'HEAD',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0)'
            }
          });
          return response.ok ? url : null;
        } catch {
          return null;
        }
      })
    );
    
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        validUrls.push(result.value);
      }
    });
  }
  
  return validUrls;
} 