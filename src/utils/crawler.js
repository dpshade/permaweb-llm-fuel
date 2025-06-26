/**
 * Dynamic browser-based crawler for Permaweb documentation sites
 * Discovers pages by following links and analyzing site structures
 */

import Defuddle from 'defuddle';

// Dynamic import for Node.js environment
let JSDOM;
if (typeof window === 'undefined') {
  JSDOM = (await import('jsdom')).JSDOM;
}

// Site configurations with crawling parameters
const CRAWL_CONFIGS = {
  ao: {
    name: 'AO Cookbook',
    baseUrl: 'https://cookbook_ao.arweave.net',
    maxDepth: 4,
    maxPages: 100,
    selectors: {
      title: 'h1, title, .page-title, .doc-title',
      navigation: 'nav a, .sidebar a, .nav a, .toc a, .menu a, .docs-nav a, .page-nav a, .content-nav a, .left-sidebar a, .right-sidebar a, .navigation a, .doc-nav a',
      content: 'main, .content, article, .markdown-body, .doc-content, .page-content, .documentation'
    },
    excludePatterns: [
      /\/api\//,
      /\.(pdf|zip|tar|gz)$/,
      /mailto:/,
      /#$/
    ],
    // Add specific seed URLs we know exist
    seedUrls: [
      '/welcome/ao-core-introduction.html',
      '/guides/',
      '/concepts/',
      '/tutorials/',
      '/references/'
    ]
  },
  ario: {
    name: 'AR-IO Network',
    baseUrl: 'https://docs.arweave.net',
    maxDepth: 4,
    maxPages: 100,
    selectors: {
      title: 'h1, title, .page-title, .doc-title',
      navigation: 'nav a, .sidebar a, .nav a, .toc a, .menu a, .docs-nav a, .page-nav a, .content-nav a, .left-sidebar a, .right-sidebar a, .navigation a, .doc-nav a',
      content: 'main, .content, article, .markdown-body, .doc-content, .page-content, .documentation'
    },
    excludePatterns: [
      /\/api\//,
      /\.(pdf|zip|tar|gz)$/,
      /mailto:/,
      /#$/
    ],
    // Add specific AR-IO SDK paths
    seedUrls: [
      '/ar-io-sdk/getting-started',
      '/ar-io-sdk/',
      '/gateways/',
      '/observers/',
      '/developers/',
      '/guides/'
    ]
  },
  arweave: {
    name: 'Arweave Cookbook',
    baseUrl: 'https://cookbook.arweave.net',
    maxDepth: 4,
    maxPages: 100,
    selectors: {
      title: 'h1, title, .page-title, .doc-title',
      navigation: 'nav a, .sidebar a, .nav a, .toc a, .menu a, .docs-nav a, .page-nav a, .content-nav a, .left-sidebar a, .right-sidebar a, .navigation a, .doc-nav a',
      content: 'main, .content, article, .markdown-body, .doc-content, .page-content, .documentation'
    },
    excludePatterns: [
      /\/api\//,
      /\.(pdf|zip|tar|gz)$/,
      /mailto:/,
      /#$/
    ],
    seedUrls: [
      '/getting-started/',
      '/guides/',
      '/concepts/',
      '/references/'
    ]
  },
  hyperbeam: {
    name: 'Hyperbeam',
    baseUrl: 'https://hyperbeam.arweave.net',
    maxDepth: 3,
    maxPages: 75,
    selectors: {
      title: 'h1, title, .page-title, .doc-title',
      navigation: 'nav a, .sidebar a, .nav a, .toc a, .menu a, .docs-nav a, .page-nav a, .content-nav a, .left-sidebar a, .right-sidebar a, .navigation a, .doc-nav a',
      content: 'main, .content, article, .markdown-body, .doc-content, .page-content, .documentation'
    },
    excludePatterns: [
      /\/api\//,
      /\.(pdf|zip|tar|gz)$/,
      /mailto:/,
      /#$/
    ],
    seedUrls: [
      '/build/',
      '/run/',
      '/learn/',
      '/docs/'
    ]
  }
};

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
function extractLinks(doc, baseUrl, config) {
  const links = new Set();
  
  // Try navigation selectors first (more targeted)
  const navSelectors = config.selectors.navigation.split(',').map(s => s.trim());
  
  for (const selector of navSelectors) {
    try {
      const navLinks = doc.querySelectorAll(selector);
      navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
          const absoluteUrl = resolveUrl(href, baseUrl);
          if (absoluteUrl && isValidUrl(absoluteUrl, baseUrl, config)) {
            links.add(absoluteUrl);
          }
        }
      });
    } catch (e) {
      // Selector might not be valid for this page
    }
  }
  
  // If we didn't find many nav links, fall back to all links
  if (links.size < 3) {
    const allLinks = doc.querySelectorAll('a[href]');
    allLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        const absoluteUrl = resolveUrl(href, baseUrl);
        if (absoluteUrl && isValidUrl(absoluteUrl, baseUrl, config)) {
          links.add(absoluteUrl);
        }
      }
    });
  }
  
  return Array.from(links);
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
    
    // Must look like a documentation page
    return (
      path.endsWith('/') || 

      path.length >= 1 // Accept any non-root path that passed other filters
    );
    
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
  
  // Determine category and priority from URL path and title
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  const fullPath = pathParts.join('/').toLowerCase();
  const titleLower = cleanedTitle.toLowerCase();
  
  let category = 'general';
  let priority = 3;
  
  // Check all path parts and title for categorization keywords
  const allText = fullPath + ' ' + titleLower;
  
  if (allText.includes('welcome') || allText.includes('intro') || allText.includes('overview')) {
    category = 'introduction';
    priority = 1;
  } else if (allText.includes('getting-started') || allText.includes('get-started') || allText.includes('start') || allText.includes('install')) {
    category = 'getting-started';
    priority = 1;
  } else if (allText.includes('concept') || allText.includes('fundamental') || allText.includes('core') || allText.includes('basic')) {
    category = 'concepts';
    priority = 2;
  } else if (allText.includes('guide') || allText.includes('tutorial') || allText.includes('how-to') || allText.includes('walk')) {
    category = 'guides';
    priority = 2;
  } else if (allText.includes('reference') || allText.includes('api') || allText.includes('spec') || allText.includes('docs')) {
    category = 'references';
    priority = 3;
  } else if (allText.includes('example') || allText.includes('demo') || allText.includes('sample')) {
    category = 'examples';
    priority = 2;
  } else if (allText.includes('troubleshoot') || allText.includes('faq') || allText.includes('help')) {
    category = 'troubleshooting';
    priority = 3;
  } else if (allText.includes('deploy') || allText.includes('build') || allText.includes('setup')) {
    category = 'deployment';
    priority = 2;
  } else if (pathParts.length > 0) {
    // Use the first meaningful path segment as category
    const firstPart = pathParts[0].toLowerCase();
    if (firstPart.length > 2 && firstPart !== 'docs' && firstPart !== 'documentation') {
      category = firstPart.replace(/-/g, ' ');
    }
  }
  
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
    category,
    priority,
    estimatedWords, // Use actual word count, not minimum
    tags,
    description: description || `${cleanedTitle} - Documentation page`,
    author,
    breadcrumbs: pathParts
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
        const navLinks = extractLinks(rootDoc, baseUrl, config);
        
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
 * @param {Function} progressCallback - Progress callback (current, total, url)
 * @returns {Promise<Object>} Crawl results
 */
export async function crawlSite(siteKey, progressCallback = () => {}) {
  const config = CRAWL_CONFIGS[siteKey];
  if (!config) {
    throw new Error(`Unknown site: ${siteKey}`);
  }
  
  const visited = new Set();
  const pages = [];
  const queue = [];
  const errors = [];
  
  console.log(`Starting discovery phase for ${config.name}...`);
  
  // Discover entry points dynamically
  const discoveredPaths = await discoverEntryPoints(config.baseUrl, config);
  
  if (discoveredPaths.length === 0) {
    console.warn(`No entry points discovered for ${config.name}, falling back to root`);
    discoveredPaths.push('/');
  }
  
  // Initialize queue with discovered entry points (limit to prevent overwhelming)
  const entryPointsToUse = discoveredPaths.slice(0, Math.min(10, discoveredPaths.length));
  console.log(`Using ${entryPointsToUse.length} entry points:`, entryPointsToUse);
  
  for (const entryPoint of entryPointsToUse) {
    const url = config.baseUrl + (entryPoint.startsWith('/') ? entryPoint : '/' + entryPoint);
    queue.push({ url, depth: 0 });
  }
  
  console.log(`Starting dynamic crawl of ${config.name}...`);
  
  while (queue.length > 0 && pages.length < config.maxPages) {
    const { url, depth } = queue.shift();
    
    if (visited.has(url) || depth > config.maxDepth) {
      continue;
    }
    
    visited.add(url);
    progressCallback(pages.length + 1, config.maxPages, url);
    
    try {
      const doc = await fetchPage(url);
      if (!doc) {
        errors.push({ url, error: 'Failed to fetch page' });
        continue;
      }
      
      // Extract page metadata
      const pageData = extractPageMetadata(doc, url, config);
      if (!pageData) {
        // Page was rejected by quality filters
        console.warn(`Page rejected by quality filters: ${url}`);
        continue;
      }
      
      pages.push({
        ...pageData,
        siteKey,
        siteName: config.name,
        depth
      });
      
      // Extract links for horizontal navigation (same depth) and deeper exploration
      if (pages.length < config.maxPages) {
        const links = extractLinks(doc, config.baseUrl, config);
        
        // Separate navigation links (likely same depth) from content links (likely deeper)
        const { navigationLinks, contentLinks } = categorizeLinks(doc, links, config);
        
        // Add navigation links at same depth (higher priority)
        for (const link of navigationLinks.slice(0, 8)) {
          if (!visited.has(link)) {
            queue.unshift({ url: link, depth }); // Use unshift for higher priority
            console.log(`➜ Found sibling navigation: ${link}`);
          }
        }
        
        // Add content links at next depth level if not at max depth
        if (depth < config.maxDepth) {
          for (const link of contentLinks.slice(0, 5)) {
            if (!visited.has(link)) {
              queue.push({ url: link, depth: depth + 1 });
            }
          }
        }
      }
      
      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.error(`Error crawling ${url}:`, error);
      errors.push({ url, error: error.message });
    }
  }
  
  console.log(`Crawled ${pages.length} pages from ${config.name}`);
  
  // Filter and deduplicate pages with improved quality thresholds
  const filteredPages = [];
  const seenContent = new Set();
  const seenTitles = new Set();
  
  for (const page of pages) {
    // Skip if content is too similar (basic deduplication)
    const contentHash = page.description?.slice(0, 100) || page.title;
    if (seenContent.has(contentHash)) {
      console.warn(`Duplicate content detected, skipping: ${page.url}`);
      continue;
    }
    
    // Skip if title is too generic and we already have similar titles
    if (seenTitles.has(page.title) && page.estimatedWords < 200) {
      console.warn(`Duplicate title with low content, skipping: ${page.url}`);
      continue;
    }
    
    // Enhanced quality filtering - reduced threshold for better discovery
    if (page.estimatedWords < 50) {
      console.warn(`Filtering low-quality page (${page.estimatedWords} words): ${page.url}`);
      continue;
    }

    // Check for common problematic word counts that indicate boilerplate
    const problematicCounts = [72, 148, 50, 75]; // Common boilerplate word counts
    if (problematicCounts.includes(page.estimatedWords)) {
      console.warn(`Filtering likely boilerplate page (${page.estimatedWords} words): ${page.url}`);
      continue;
    }
    
    seenContent.add(contentHash);
    seenTitles.add(page.title);
    filteredPages.push(page);
  }
  
  console.log(`Filtered to ${filteredPages.length} quality pages from ${config.name}`);
  
  return {
    siteKey,
    name: config.name,
    baseUrl: config.baseUrl,
    pages: filteredPages,
    errors,
    crawledAt: new Date().toISOString()
  };
}

/**
 * Crawl all configured sites
 * @param {Function} progressCallback - Progress callback (siteKey, current, total, url)
 * @returns {Promise<Object>} All crawl results
 */
export async function crawlAllSites(progressCallback = () => {}) {
  const results = {};
  const siteKeys = Object.keys(CRAWL_CONFIGS);
  
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
        name: CRAWL_CONFIGS[siteKey].name,
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
 * @returns {Object} Display tree structure
 */
export function buildDisplayTree(crawlResults) {
  const tree = {};
  
  for (const [siteKey, siteData] of Object.entries(crawlResults)) {
    if (siteData.error) {
      tree[siteKey] = {
        name: siteData.name,
        error: siteData.error,
        categories: {},
        pages: []
      };
      continue;
    }
    
    tree[siteKey] = {
      name: siteData.name,
      description: `${siteData.pages.length} pages discovered`,
      categories: {},
      pages: siteData.pages
    };
    
    // Group pages by category
    for (const page of siteData.pages) {
      if (!tree[siteKey].categories[page.category]) {
        tree[siteKey].categories[page.category] = {
          name: page.category,
          description: `${page.category} documentation`,
          pages: []
        };
      }
      
      tree[siteKey].categories[page.category].pages.push(page);
    }
  }
  
  return tree;
}

/**
 * Get all crawl configurations
 * @returns {Object} All site configurations
 */
export function getCrawlConfigs() {
  return CRAWL_CONFIGS;
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