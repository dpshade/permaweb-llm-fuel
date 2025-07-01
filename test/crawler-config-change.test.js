import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { runCrawl } from '../src/utils/crawler.js';

// Mock fetch to avoid actual HTTP requests
global.fetch = vi.fn();

describe('Crawler Configuration Change Detection', () => {
  const testIndexPath = resolve(process.cwd(), 'test-temp-index.json');
  const testConfigPath = resolve(process.cwd(), 'test-temp-config.json');

  beforeEach(async () => {
    // Clean up any existing test files
    try {
      await fs.unlink(testIndexPath);
    } catch {}
    try {
      await fs.unlink(testConfigPath);
    } catch {}
    
    // Mock successful fetch responses
    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      text: () => Promise.resolve('<html><head><title>Test Page</title></head><body><h1>Test Content</h1></body></html>')
    });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink(testIndexPath);
    } catch {}
    try {
      await fs.unlink(testConfigPath);
    } catch {}
    
    // Reset mocks
    vi.clearAllMocks();
  });

  it('should detect configuration changes and trigger full recrawl', async () => {
    // Create initial configuration
    const initialConfig = {
      testSite: {
        name: "Test Site",
        baseUrl: "https://test.example.com",
        maxDepth: 2,
        maxPages: 10,
        selectors: {
          title: "h1, title",
          content: "main, .content"
        },
        excludePatterns: ["/exclude1/"],
        seedUrls: ["/start"]
      }
    };

    await fs.writeFile(testConfigPath, JSON.stringify(initialConfig, null, 2));

    // Mock the config loading to use our test file
    vi.doMock('../src/utils/crawler.js', async () => {
      const originalModule = await vi.importActual('../src/utils/crawler.js');
      return {
        ...originalModule,
        loadCrawlConfigs: async () => {
          const configJson = await fs.readFile(testConfigPath, 'utf8');
          const rawConfigs = JSON.parse(configJson);
          
          // Simulate the hash generation
          const configString = JSON.stringify(rawConfigs, (key, value) => {
            if (Array.isArray(value)) return value.sort();
            return value;
          });
          const hash = require('crypto').createHash('sha256').update(configString).digest('hex').substring(0, 8);
          
          return {
            ...rawConfigs,
            _configHash: hash
          };
        }
      };
    });

    // Run initial crawl
    await runCrawl('testSite', { outputPath: testIndexPath });

    // Verify initial index was created with config hash
    const initialIndex = JSON.parse(await fs.readFile(testIndexPath, 'utf8'));
    expect(initialIndex.configHash).toBeDefined();
    const initialHash = initialIndex.configHash;

    // Modify configuration
    const modifiedConfig = {
      testSite: {
        name: "Test Site Modified",
        baseUrl: "https://test.example.com",
        maxDepth: 3, // Changed from 2
        maxPages: 15, // Changed from 10
        selectors: {
          title: "h1, title",
          content: "main, .content"
        },
        excludePatterns: ["/exclude1/", "/exclude2/"], // Added new pattern
        seedUrls: ["/start", "/start2"] // Added new seed URL
      }
    };

    await fs.writeFile(testConfigPath, JSON.stringify(modifiedConfig, null, 2));

    // Run crawl again - should detect config change
    await runCrawl('testSite', { outputPath: testIndexPath });

    // Verify new index has different hash
    const newIndex = JSON.parse(await fs.readFile(testIndexPath, 'utf8'));
    expect(newIndex.configHash).toBeDefined();
    expect(newIndex.configHash).not.toBe(initialHash);

    // Verify that the crawl was triggered (fetch should have been called)
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should handle missing config hash in existing index', async () => {
    // Create an index without config hash (simulating old format)
    const oldIndex = {
      generated: new Date().toISOString(),
      sites: {
        testSite: {
          name: "Test Site",
          pages: []
        }
      }
    };

    await fs.writeFile(testIndexPath, JSON.stringify(oldIndex, null, 2));

    // Create current configuration
    const config = {
      testSite: {
        name: "Test Site",
        baseUrl: "https://test.example.com",
        maxDepth: 2,
        maxPages: 10,
        selectors: {
          title: "h1, title",
          content: "main, .content"
        },
        excludePatterns: ["/exclude1/"],
        seedUrls: ["/start"]
      }
    };

    await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2));

    // Mock the config loading
    vi.doMock('../src/utils/crawler.js', async () => {
      const originalModule = await vi.importActual('../src/utils/crawler.js');
      return {
        ...originalModule,
        loadCrawlConfigs: async () => {
          const configJson = await fs.readFile(testConfigPath, 'utf8');
          const rawConfigs = JSON.parse(configJson);
          
          const configString = JSON.stringify(rawConfigs, (key, value) => {
            if (Array.isArray(value)) return value.sort();
            return value;
          });
          const hash = require('crypto').createHash('sha256').update(configString).digest('hex').substring(0, 8);
          
          return {
            ...rawConfigs,
            _configHash: hash
          };
        }
      };
    });

    // Run crawl - should detect missing hash and do full recrawl
    await runCrawl('testSite', { outputPath: testIndexPath });

    // Verify new index has config hash
    const newIndex = JSON.parse(await fs.readFile(testIndexPath, 'utf8'));
    expect(newIndex.configHash).toBeDefined();

    // Verify that fetch was called (indicating crawl was performed)
    expect(global.fetch).toHaveBeenCalled();
  });
}); 