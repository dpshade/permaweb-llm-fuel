import pageStore from '../data/page-store.json';

/**
 * Get all pages from the store
 * @returns {Array} Array of all pages with site information
 */
export function getAllPages() {
  const allPages = [];
  
  for (const [siteKey, siteData] of Object.entries(pageStore.sites)) {
    for (const page of siteData.pages) {
      allPages.push({
        ...page,
        siteKey,
        siteName: siteData.name,
        siteDescription: siteData.description
      });
    }
  }
  
  return allPages;
}

/**
 * Get pages filtered by criteria
 * @param {Object} filters - Filter criteria
 * @param {number[]} filters.priorities - Array of priority levels to include
 * @param {string[]} filters.categories - Array of categories to include
 * @param {string[]} filters.tags - Array of tags to include (any match)
 * @param {string[]} filters.sites - Array of site keys to include
 * @param {number} filters.minWords - Minimum estimated word count
 * @param {number} filters.maxWords - Maximum estimated word count
 * @returns {Array} Filtered array of pages
 */
export function getFilteredPages(filters = {}) {
  const {
    priorities = [1, 2, 3, 4, 5],
    categories = [],
    tags = [],
    sites = [],
    minWords = 0,
    maxWords = Infinity
  } = filters;
  
  return getAllPages().filter(page => {
    // Priority filter
    if (!priorities.includes(page.priority)) return false;
    
    // Category filter
    if (categories.length > 0 && !categories.includes(page.category)) return false;
    
    // Tags filter (any tag match)
    if (tags.length > 0 && !tags.some(tag => page.tags.includes(tag))) return false;
    
    // Sites filter
    if (sites.length > 0 && !sites.includes(page.siteKey)) return false;
    
    // Word count filter
    if (page.estimatedWords < minWords || page.estimatedWords > maxWords) return false;
    
    return true;
  });
}

/**
 * Get pages by priority level
 * @param {number} priority - Priority level (1-5)
 * @returns {Array} Pages with the specified priority
 */
export function getPagesByPriority(priority) {
  return getFilteredPages({ priorities: [priority] });
}

/**
 * Get essential pages (priority 1)
 * @returns {Array} Essential pages across all sites
 */
export function getEssentialPages() {
  return getPagesByPriority(1);
}

/**
 * Get pages by category
 * @param {string} category - Category name
 * @returns {Array} Pages in the specified category
 */
export function getPagesByCategory(category) {
  return getFilteredPages({ categories: [category] });
}

/**
 * Get pages by site
 * @param {string} siteKey - Site key (ao, arweave, hyperbeam)
 * @returns {Array} Pages from the specified site
 */
export function getPagesBySite(siteKey) {
  return getFilteredPages({ sites: [siteKey] });
}

/**
 * Search pages by text
 * @param {string} query - Search query
 * @returns {Array} Pages matching the search query
 */
export function searchPages(query) {
  const searchTerm = query.toLowerCase();
  
  return getAllPages().filter(page => {
    return (
      page.title.toLowerCase().includes(searchTerm) ||
      page.description.toLowerCase().includes(searchTerm) ||
      page.tags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
      page.category.toLowerCase().includes(searchTerm)
    );
  });
}

/**
 * Get recommended page selection for LLM training
 * @param {Object} options - Selection options
 * @param {boolean} options.includeEssential - Include all priority 1 pages
 * @param {boolean} options.includeImportant - Include priority 2 pages
 * @param {number} options.maxPages - Maximum number of pages
 * @param {number} options.maxWords - Maximum total word count
 * @returns {Array} Recommended pages for LLM training
 */
export function getRecommendedSelection(options = {}) {
  const {
    includeEssential = true,
    includeImportant = true,
    maxPages = 15,
    maxWords = 20000
  } = options;
  
  let selectedPages = [];
  let totalWords = 0;
  
  // Always include essential pages if requested
  if (includeEssential) {
    const essentialPages = getEssentialPages().sort((a, b) => a.estimatedWords - b.estimatedWords);
    
    for (const page of essentialPages) {
      if (selectedPages.length >= maxPages || totalWords + page.estimatedWords > maxWords) break;
      selectedPages.push(page);
      totalWords += page.estimatedWords;
    }
  }
  
  // Add important pages if requested and space available
  if (includeImportant && selectedPages.length < maxPages && totalWords < maxWords) {
    const importantPages = getPagesByPriority(2)
      .filter(page => !selectedPages.includes(page))
      .sort((a, b) => a.estimatedWords - b.estimatedWords);
    
    for (const page of importantPages) {
      if (selectedPages.length >= maxPages || totalWords + page.estimatedWords > maxWords) break;
      selectedPages.push(page);
      totalWords += page.estimatedWords;
    }
  }
  
  return selectedPages;
}

/**
 * Build tree structure for UI display
 * @param {Array} pages - Array of pages to organize
 * @returns {Object} Tree structure organized by site and category
 */
export function buildDisplayTree(pages = getAllPages()) {
  const tree = {};
  
  // Group by site first
  for (const page of pages) {
    if (!tree[page.siteKey]) {
      tree[page.siteKey] = {
        name: page.siteName,
        description: page.siteDescription,
        categories: {},
        pages: []
      };
    }
    
    // Group by category within site
    if (!tree[page.siteKey].categories[page.category]) {
      tree[page.siteKey].categories[page.category] = {
        name: page.category,
        description: pageStore.metadata.categories[page.category] || '',
        pages: []
      };
    }
    
    tree[page.siteKey].categories[page.category].pages.push(page);
    tree[page.siteKey].pages.push(page);
  }
  
  return tree;
}

/**
 * Get store metadata
 * @returns {Object} Store metadata including priority levels and categories
 */
export function getStoreMetadata() {
  return pageStore.metadata;
}

/**
 * Validate page URLs (for maintenance)
 * @returns {Promise<Object>} Validation results
 */
export async function validatePageUrls() {
  const results = {
    total: 0,
    valid: 0,
    invalid: 0,
    errors: []
  };
  
  const allPages = getAllPages();
  results.total = allPages.length;
  
  for (const page of allPages) {
    try {
      const response = await fetch(page.url, { method: 'HEAD' });
      if (response.ok) {
        results.valid++;
      } else {
        results.invalid++;
        results.errors.push({
          url: page.url,
          title: page.title,
          status: response.status,
          error: `HTTP ${response.status}`
        });
      }
    } catch (error) {
      results.invalid++;
      results.errors.push({
        url: page.url,
        title: page.title,
        error: error.message
      });
    }
    
    // Small delay to be respectful
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

/**
 * Export preset selections for common use cases
 */
export const presets = {
  essentials: () => getEssentialPages(),
  quickStart: () => getRecommendedSelection({ maxPages: 8, maxWords: 10000 }),
  comprehensive: () => getRecommendedSelection({ maxPages: 20, maxWords: 30000 }),
  aoOnly: () => getPagesBySite('ao'),
  arweaveOnly: () => getPagesBySite('arweave'),
  hyperbeamOnly: () => getPagesBySite('hyperbeam'),
  conceptsOnly: () => getPagesByCategory('concepts'),
  guidesOnly: () => getPagesByCategory('guides'),
  referencesOnly: () => getPagesByCategory('references')
}; 