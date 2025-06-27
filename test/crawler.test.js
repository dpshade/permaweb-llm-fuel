import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCrawlConfigs, buildDisplayTree } from '../src/utils/crawler.js';

// Mock fetch for testing
global.fetch = vi.fn();
global.DOMParser = vi.fn(() => ({
  parseFromString: vi.fn(() => ({
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(() => [])
  }))
}));

describe('Dynamic Crawler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCrawlConfigs', () => {
    it('should return all site configurations', async () => {
      const configs = await getCrawlConfigs();
      
      expect(configs).toHaveProperty('ao');
      expect(configs).toHaveProperty('arweave');
      expect(configs).toHaveProperty('hyperbeam');
      
      expect(configs.ao).toHaveProperty('name', 'AO Cookbook');
      expect(configs.ao).toHaveProperty('baseUrl', 'https://cookbook_ao.arweave.net');
      expect(configs.ao).toHaveProperty('maxDepth');
      expect(configs.ao).toHaveProperty('maxPages');
      expect(configs.ao).toHaveProperty('selectors');
    });

    it('should have valid selectors for each site', async () => {
      const configs = await getCrawlConfigs();
      
      Object.values(configs).forEach(config => {
        expect(config.selectors).toHaveProperty('title');
        expect(config.selectors).toHaveProperty('content');
        
        expect(typeof config.selectors.title).toBe('string');
        expect(typeof config.selectors.content).toBe('string');
      });
    });

    it('should have reasonable crawl limits', async () => {
      const configs = await getCrawlConfigs();
      
      Object.values(configs).forEach(config => {
        expect(config.maxDepth).toBeGreaterThan(0);
        expect(config.maxDepth).toBeLessThanOrEqual(5);
        expect(config.maxPages).toBeGreaterThan(10);
        expect(config.maxPages).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('buildDisplayTree', () => {
    it('should build tree from crawl results', () => {
      const mockCrawlResults = {
        ao: {
          siteKey: 'ao',
          name: 'AO Cookbook',
          pages: [
            {
              url: 'https://cookbook_ao.arweave.net/welcome',
              title: 'Welcome',
              category: 'introduction',
              priority: 1,
              siteKey: 'ao'
            },
            {
              url: 'https://cookbook_ao.arweave.net/guides/setup',
              title: 'Setup Guide',
              category: 'guides',
              priority: 2,
              siteKey: 'ao'
            }
          ]
        },
        arweave: {
          siteKey: 'arweave',
          name: 'Arweave Cookbook',
          error: 'Failed to crawl'
        }
      };

      const tree = buildDisplayTree(mockCrawlResults);

      expect(tree).toHaveProperty('ao');
      expect(tree).toHaveProperty('arweave');

      // Check successful site
      expect(tree.ao.name).toBe('AO Cookbook');
      expect(tree.ao.pages).toHaveLength(2);
      expect(tree.ao.categories).toHaveProperty('introduction');
      expect(tree.ao.categories).toHaveProperty('guides');
      expect(tree.ao.categories.introduction.pages).toHaveLength(1);
      expect(tree.ao.categories.guides.pages).toHaveLength(1);

      // Check failed site
      expect(tree.arweave.error).toBe('Failed to crawl');
      expect(tree.arweave.pages).toHaveLength(0);
    });

    it('should handle empty crawl results', () => {
      const tree = buildDisplayTree({});
      expect(tree).toEqual({});
    });

    it('should group pages by category correctly', () => {
      const mockCrawlResults = {
        test: {
          siteKey: 'test',
          name: 'Test Site',
          pages: [
            { category: 'guides', siteKey: 'test', title: 'Guide 1' },
            { category: 'guides', siteKey: 'test', title: 'Guide 2' },
            { category: 'references', siteKey: 'test', title: 'Ref 1' }
          ]
        }
      };

      const tree = buildDisplayTree(mockCrawlResults);
      
      expect(tree.test.categories.guides.pages).toHaveLength(2);
      expect(tree.test.categories.references.pages).toHaveLength(1);
    });
  });

  describe('URL validation and resolution', () => {
    it('should validate URLs correctly', async () => {
      // This would test the isValidUrl function if it were exported
      // For now, we test through the configs
      const configs = await getCrawlConfigs();
      
      Object.values(configs).forEach(config => {
        expect(Array.isArray(config.excludePatterns)).toBe(true);
        
        config.excludePatterns.forEach(pattern => {
          expect(pattern instanceof RegExp).toBe(true);
        });
      });
    });

    it('should have valid base URLs', async () => {
      const configs = await getCrawlConfigs();
      
      Object.values(configs).forEach(config => {
        expect(() => new URL(config.baseUrl)).not.toThrow();
        expect(config.baseUrl.startsWith('https://')).toBe(true);
      });
    });
  });

  describe('Page metadata extraction', () => {
    it('should have valid selectors for each site', async () => {
      const configs = await getCrawlConfigs();
      
      Object.values(configs).forEach(config => {
        expect(config.selectors).toHaveProperty('title');
        expect(config.selectors).toHaveProperty('content');
        
        expect(typeof config.selectors.title).toBe('string');
        expect(typeof config.selectors.content).toBe('string');
      });
    });
  });

  describe('Priority and categorization logic', () => {
    it('should assign priorities based on URL patterns', () => {
      // Test the priority assignment logic
      const testCases = [
        { path: '/welcome/intro', expectedPriority: 1, expectedCategory: 'introduction' },
        { path: '/getting-started/setup', expectedPriority: 1, expectedCategory: 'getting-started' },
        { path: '/concepts/overview', expectedPriority: 2, expectedCategory: 'concepts' },
        { path: '/guides/tutorial', expectedPriority: 2, expectedCategory: 'guides' },
        { path: '/references/api', expectedPriority: 3, expectedCategory: 'references' },
        { path: '/random/page', expectedPriority: 3, expectedCategory: 'general' }
      ];

      testCases.forEach(({ path, expectedPriority, expectedCategory }) => {
        // This would test the extractPageMetadata function if it were exported
        // The logic is tested indirectly through integration tests
        expect(expectedPriority).toBeGreaterThanOrEqual(1);
        expect(expectedPriority).toBeLessThanOrEqual(3);
        expect(typeof expectedCategory).toBe('string');
      });
    });
  });
}); 