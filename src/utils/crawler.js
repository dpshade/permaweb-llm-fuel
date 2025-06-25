import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';
import path from 'node:path';

// Permaweb documentation sites to crawl
const SITES = {
  ao: {
    name: 'AO Cookbook',
    baseUrl: 'https://cookbook_ao.arweave.net',
    startPaths: ['/welcome', '/guides', '/references'],
    maxDepth: 3
  },
  hyperbeam: {
    name: 'Hyperbeam',
    baseUrl: 'https://hyperbeam.arweave.net',
    startPaths: ['/build', '/learn'],
    maxDepth: 3
  },
  arweave: {
    name: 'Arweave Cookbook',
    baseUrl: 'https://cookbook.arweave.net',
    startPaths: ['/getting-started', '/guides', '/references'],
    maxDepth: 3
  }
};

/**
 * Extract links from a page
 * @param {string} html - HTML content
 * @param {string} baseUrl - Base URL for resolving relative links
 * @returns {string[]} Array of absolute URLs
 */
function extractLinks(html, baseUrl) {
  const dom = new JSDOM(html);
  const links = dom.window.document.querySelectorAll('a[href]');
  const urls = [];
  
  for (const link of links) {
    const href = link.getAttribute('href');
    if (!href) continue;
    
    // Skip external links, anchors, and non-HTML files
    if (href.startsWith('http') && !href.startsWith(baseUrl)) continue;
    if (href.startsWith('#')) continue;
    if (href.includes('mailto:')) continue;
    if (!href.endsWith('.html') && !href.endsWith('/') && !href.includes('.html')) continue;
    
    // Convert relative URLs to absolute
    let absoluteUrl;
    if (href.startsWith('/')) {
      absoluteUrl = baseUrl + href;
    } else if (href.startsWith('./')) {
      absoluteUrl = baseUrl + href.substring(1);
    } else if (!href.startsWith('http')) {
      absoluteUrl = baseUrl + '/' + href;
    } else {
      absoluteUrl = href;
    }
    
    // Normalize URL
    absoluteUrl = absoluteUrl.replace(/\/+/g, '/').replace(':/', '://');
    
    urls.push(absoluteUrl);
  }
  
  return [...new Set(urls)]; // Remove duplicates
}

/**
 * Crawl a single site
 * @param {Object} siteConfig - Site configuration
 * @returns {Promise<Array>} Array of page objects
 */
async function crawlSite(siteConfig) {
  const { name, baseUrl, startPaths, maxDepth } = siteConfig;
  const visited = new Set();
  const pages = [];
  const queue = [];
  
  // Initialize queue with start paths
  for (const startPath of startPaths) {
    const url = baseUrl + (startPath.startsWith('/') ? startPath : '/' + startPath);
    queue.push({ url, depth: 0, breadcrumbs: [startPath.replace('/', '')] });
  }
  
  console.log(`Crawling ${name} (${baseUrl})...`);
  
  while (queue.length > 0) {
    const { url, depth, breadcrumbs } = queue.shift();
    
    if (visited.has(url) || depth > maxDepth) continue;
    visited.add(url);
    
    try {
      console.log(`  Fetching: ${url} (depth: ${depth})`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0)'
        }
      });
      
      if (!response.ok) {
        console.warn(`    Failed to fetch ${url}: ${response.status}`);
        continue;
      }
      
      const html = await response.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // Extract page title
      const titleElement = document.querySelector('title') || document.querySelector('h1');
      const title = titleElement ? titleElement.textContent.trim() : 'Untitled';
      
      // Create page object
      const page = {
        url,
        title,
        breadcrumbs: [...breadcrumbs],
        depth,
        site: name
      };
      
      pages.push(page);
      
      // Extract links for next level
      if (depth < maxDepth) {
        const links = extractLinks(html, baseUrl);
        for (const link of links) {
          if (!visited.has(link)) {
            // Create breadcrumbs for the new page
            const pathParts = new URL(link).pathname.split('/').filter(Boolean);
            const newBreadcrumbs = pathParts.length > 0 ? pathParts : [...breadcrumbs, 'page'];
            
            queue.push({
              url: link,
              depth: depth + 1,
              breadcrumbs: newBreadcrumbs
            });
          }
        }
      }
      
      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`    Error crawling ${url}:`, error.message);
    }
  }
  
  console.log(`  Found ${pages.length} pages for ${name}`);
  return pages;
}

/**
 * Build a hierarchical tree structure from flat page list
 * @param {Array} pages - Flat array of page objects
 * @returns {Object} Hierarchical tree structure
 */
function buildTree(pages) {
  const tree = {};
  
  for (const page of pages) {
    let current = tree;
    
    // Navigate/create the tree structure based on breadcrumbs
    for (let i = 0; i < page.breadcrumbs.length; i++) {
      const crumb = page.breadcrumbs[i];
      
      if (!current[crumb]) {
        current[crumb] = {
          name: crumb,
          children: {},
          pages: []
        };
      }
      
      // If this is the last breadcrumb, add the page
      if (i === page.breadcrumbs.length - 1) {
        current[crumb].pages.push(page);
      }
      
      current = current[crumb].children;
    }
  }
  
  return tree;
}

/**
 * Convert tree object to array format for easier rendering
 * @param {Object} tree - Tree object
 * @returns {Array} Array representation of tree
 */
function treeToArray(tree) {
  const result = [];
  
  function traverse(node, name, path = []) {
    const currentPath = [...path, name];
    const item = {
      name,
      path: currentPath,
      pages: node.pages || [],
      children: []
    };
    
    // Recursively process children
    for (const [childName, childNode] of Object.entries(node.children || {})) {
      item.children.push(traverse(childNode, childName, currentPath));
    }
    
    return item;
  }
  
  for (const [name, node] of Object.entries(tree)) {
    result.push(traverse(node, name));
  }
  
  return result;
}

/**
 * Main crawler function
 * @returns {Promise<void>}
 */
export async function crawlAllSites() {
  console.log('Starting documentation crawl...');
  
  const allData = {};
  
  for (const [siteKey, siteConfig] of Object.entries(SITES)) {
    try {
      const pages = await crawlSite(siteConfig);
      const tree = buildTree(pages);
      const arrayTree = treeToArray(tree);
      
      allData[siteKey] = {
        name: siteConfig.name,
        baseUrl: siteConfig.baseUrl,
        pages,
        tree: arrayTree,
        crawledAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`Failed to crawl ${siteConfig.name}:`, error);
      allData[siteKey] = {
        name: siteConfig.name,
        baseUrl: siteConfig.baseUrl,
        pages: [],
        tree: [],
        error: error.message,
        crawledAt: new Date().toISOString()
      };
    }
  }
  
  // Write the index file
  const outputPath = path.resolve('src/data/docs-index.json');
  await fs.writeFile(outputPath, JSON.stringify(allData, null, 2));
  
  const totalPages = Object.values(allData).reduce((sum, site) => sum + site.pages.length, 0);
  console.log(`\nCrawl complete! Found ${totalPages} total pages across ${Object.keys(allData).length} sites.`);
  console.log(`Index saved to: ${outputPath}`);
  
  return allData;
}

// Run crawler if this file is executed directly
if (import.meta.main) {
  crawlAllSites().catch(console.error);
}