/**
 * Dynamic browser-based crawler for Permaweb documentation sites
 * Discovers pages by following links and analyzing site structures
 */

// Site configurations with crawling parameters
const CRAWL_CONFIGS = {
  ao: {
    name: 'AO Cookbook',
    baseUrl: 'https://cookbook_ao.arweave.net',
    entryPoints: [
      '/welcome',
      '/guides',
      '/references'
    ],
    maxDepth: 3,
    maxPages: 50,
    selectors: {
      title: 'h1, title',
      navigation: 'nav a, .sidebar a, .nav a',
      content: 'main, .content, article, .markdown-body'
    },
    excludePatterns: [
      /\/api\//,
      /\.(pdf|zip|tar|gz)$/,
      /mailto:/,
      /#/
    ]
  },
  arweave: {
    name: 'Arweave Cookbook',
    baseUrl: 'https://cookbook.arweave.net',
    entryPoints: [
      '/getting-started',
      '/concepts',
      '/guides',
      '/references'
    ],
    maxDepth: 3,
    maxPages: 50,
    selectors: {
      title: 'h1, title',
      navigation: 'nav a, .sidebar a, .nav a',
      content: 'main, .content, article, .markdown-body'
    },
    excludePatterns: [
      /\/api\//,
      /\.(pdf|zip|tar|gz)$/,
      /mailto:/,
      /#/
    ]
  },
  hyperbeam: {
    name: 'Hyperbeam',
    baseUrl: 'https://hyperbeam.arweave.net',
    entryPoints: [
      '/build',
      '/learn'
    ],
    maxDepth: 2,
    maxPages: 30,
    selectors: {
      title: 'h1, title',
      navigation: 'nav a, .sidebar a, .nav a',
      content: 'main, .content, article, .markdown-body'
    },
    excludePatterns: [
      /\/api\//,
      /\.(pdf|zip|tar|gz)$/,
      /mailto:/,
      /#/
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
        throw new Error(`Relay failed with HTTP ${response.status}: ${response.statusText}`);
      }
      
      html = await response.text();
    }

    // Parse the HTML
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
    
  } catch (error) {
    console.warn(`Failed to fetch ${url}:`, error.message);
    return null;
  }
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
 * Resolve relative URLs to absolute URLs
 * @param {string} href - URL to resolve
 * @param {string} baseUrl - Base URL
 * @returns {string|null} Resolved absolute URL or null
 */
function resolveUrl(href, baseUrl) {
  try {
    if (href.startsWith('http')) {
      return href;
    }
    
    const base = new URL(baseUrl);
    const resolved = new URL(href, base);
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
    
    // Must look like a documentation page
    const path = urlObj.pathname;
    return (
      path.endsWith('/') || 
      path.endsWith('.html') || 
      path.includes('/guide') ||
      path.includes('/doc') ||
      path.includes('/reference') ||
      path.includes('/concept') ||
      path.includes('/tutorial')
    );
    
  } catch (error) {
    return false;
  }
}

/**
 * Extract page metadata from document
 * @param {Document} doc - Parsed HTML document
 * @param {string} url - Page URL
 * @param {Object} config - Site configuration
 * @returns {Object} Page metadata
 */
function extractPageMetadata(doc, url, config) {
  // Extract title
  let title = 'Untitled';
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
  
  // Estimate content length
  let estimatedWords = 0;
  const contentSelectors = config.selectors.content.split(',').map(s => s.trim());
  for (const selector of contentSelectors) {
    try {
      const element = doc.querySelector(selector);
      if (element) {
        const text = element.textContent || '';
        estimatedWords = Math.max(estimatedWords, text.split(/\s+/).length);
      }
    } catch (e) {
      // Selector might not be valid
    }
  }
  
  // Determine category and priority from URL path
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  
  let category = 'general';
  let priority = 3;
  
  if (pathParts.length > 0) {
    const firstPart = pathParts[0].toLowerCase();
    
    // Categorize based on URL structure
    if (firstPart.includes('welcome') || firstPart.includes('intro')) {
      category = 'introduction';
      priority = 1;
    } else if (firstPart.includes('start') || firstPart.includes('getting')) {
      category = 'getting-started';
      priority = 1;
    } else if (firstPart.includes('concept') || firstPart.includes('fundamental')) {
      category = 'concepts';
      priority = 2;
    } else if (firstPart.includes('guide') || firstPart.includes('tutorial')) {
      category = 'guides';
      priority = 2;
    } else if (firstPart.includes('reference') || firstPart.includes('api')) {
      category = 'references';
      priority = 3;
    }
  }
  
  // Generate tags from URL and title
  const tags = [];
  const allText = (title + ' ' + urlObj.pathname).toLowerCase();
  
  if (allText.includes('install')) tags.push('installation');
  if (allText.includes('setup')) tags.push('setup');
  if (allText.includes('config')) tags.push('configuration');
  if (allText.includes('api')) tags.push('api');
  if (allText.includes('tutorial')) tags.push('tutorial');
  if (allText.includes('example')) tags.push('examples');
  if (allText.includes('deploy')) tags.push('deployment');
  if (allText.includes('test')) tags.push('testing');
  
  return {
    url,
    title,
    category,
    priority,
    estimatedWords: Math.max(100, estimatedWords), // Minimum estimate
    tags,
    description: `${title} - Documentation page`,
    breadcrumbs: pathParts
  };
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
  
  // Initialize queue with entry points
  for (const entryPoint of config.entryPoints) {
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
      pages.push({
        ...pageData,
        siteKey,
        siteName: config.name,
        depth
      });
      
      // Extract links for next level if not at max depth
      if (depth < config.maxDepth && pages.length < config.maxPages) {
        const links = extractLinks(doc, config.baseUrl, config);
        
        for (const link of links.slice(0, 10)) { // Limit links per page
          if (!visited.has(link)) {
            queue.push({ url: link, depth: depth + 1 });
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
  
  return {
    siteKey,
    name: config.name,
    baseUrl: config.baseUrl,
    pages,
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