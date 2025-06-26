import { expect, it, describe } from 'vitest';
import { generateLLMsTxt, downloadFile, openContentInNewTab } from '../src/utils/defuddle-fetch.js';

describe('defuddle-fetch', () => {
  describe('generateLLMsTxt', () => {
    it('should generate proper llms.txt format with metadata', () => {
      const mockDocuments = [
        {
          title: 'First Document',
          content: 'This is the first document content.',
          url: 'https://example.com/doc1',
          wordCount: 6,
          author: 'Test Author',
          published: '2024-01-01',
          domain: 'example.com',
          parseTime: 150
        },
        {
          title: 'Second Document',
          content: 'This is the second document content.',
          url: 'https://example.com/doc2',
          wordCount: 6,
          domain: 'example.com',
          parseTime: 200
        }
      ];

      const result = generateLLMsTxt(mockDocuments);
      
      expect(result).toContain('# Permaweb Documentation Collection');
      expect(result).toContain('Total Documents: 2');
      expect(result).toContain('Total Words: 12');
      expect(result).toContain('Processing Time: 350ms');
      expect(result).toContain('Extracted with: Defuddle v0.6.4');
      expect(result).toContain('## Table of Contents');
      expect(result).toContain('# First Document');
      expect(result).toContain('# Second Document');
      expect(result).toContain('**Author:** Test Author');
      expect(result).toContain('**Source:** https://example.com/doc1');
      expect(result).toContain('**Domain:** example.com');
      expect(result).toContain('**Word Count:** 6');
      expect(result).toContain('**Parse Time:** 150ms');
    });

    it('should handle empty document list', () => {
      const result = generateLLMsTxt([]);
      
      expect(result).toContain('# Permaweb Documentation Collection');
      expect(result).toContain('Total Documents: 0');
      expect(result).toContain('Total Words: 0');
      expect(result).not.toContain('## Table of Contents');
    });

    it('should handle single document without TOC', () => {
      const mockDocuments = [
        {
          title: 'Single Document',
          content: 'This is the only document.',
          url: 'https://example.com/single',
          wordCount: 5,
          domain: 'example.com',
          parseTime: 100
        }
      ];

      const result = generateLLMsTxt(mockDocuments, { includeToc: true });
      
      expect(result).toContain('# Permaweb Documentation Collection');
      expect(result).toContain('Total Documents: 1');
      expect(result).not.toContain('## Table of Contents'); // Single doc shouldn't have TOC
      expect(result).toContain('# Single Document');
    });

    it('should respect custom options', () => {
      const mockDocuments = [
        {
          title: 'Test Document',
          content: 'Test content.',
          url: 'https://example.com/test',
          wordCount: 2,
          domain: 'example.com'
        }
      ];

      const result = generateLLMsTxt(mockDocuments, {
        includeMetadata: false,
        includeToc: false,
        customHeader: 'Custom Header Text',
        separator: '\n\n===\n\n'
      });
      
      expect(result).toContain('Custom Header Text');
      expect(result).not.toContain('# Permaweb Documentation Collection');
      expect(result).not.toContain('Total Documents:');
      expect(result).not.toContain('## Table of Contents');
      expect(result).toContain('# Test Document');
      expect(result).toContain('Test content.');
    });

    it('should handle documents with missing metadata gracefully', () => {
      const mockDocuments = [
        {
          title: 'Minimal Document',
          content: 'Basic content only.',
          url: 'https://example.com/minimal',
          wordCount: 3
          // Missing author, published, domain, parseTime
        }
      ];

      const result = generateLLMsTxt(mockDocuments);
      
      expect(result).toContain('# Minimal Document');
      expect(result).toContain('**Source:** https://example.com/minimal');
      expect(result).toContain('**Word Count:** 3');
      expect(result).not.toContain('**Author:**');
      expect(result).not.toContain('**Published:**');
      expect(result).not.toContain('**Domain:**');
      expect(result).not.toContain('**Parse Time:**');
    });

    it('should create proper anchor links in table of contents', () => {
      const mockDocuments = [
        {
          title: 'First Document with Spaces & Special-Characters!',
          content: 'Content 1',
          url: 'https://example.com/doc1',
          wordCount: 2
        },
        {
          title: 'Second-Document',
          content: 'Content 2',
          url: 'https://example.com/doc2',
          wordCount: 2
        }
      ];

      const result = generateLLMsTxt(mockDocuments);
      
      expect(result).toContain('[First Document with Spaces & Special-Characters!](#first-document-with-spaces-special-characters-)');
      expect(result).toContain('[Second-Document](#second-document)');
    });

    it('should handle batch result objects from optimized processing', () => {
      const batchResult = {
        results: [
          {
            title: 'Test Document 1',
            content: 'Content from batch processing',
            url: 'https://example.com/batch1',
            wordCount: 4
          },
          {
            title: 'Test Document 2',
            content: 'More content from batch',
            url: 'https://example.com/batch2',
            wordCount: 4
          }
        ],
        summary: {
          total: 2,
          successful: 2,
          failed: 0
        }
      };

      const result = generateLLMsTxt(batchResult);
      
      expect(result).toContain('# Permaweb Documentation Collection');
      expect(result).toContain('Total Documents: 2');
      expect(result).toContain('Total Words: 8');
      expect(result).toContain('# Test Document 1');
      expect(result).toContain('# Test Document 2');
      expect(result).toContain('Content from batch processing');
    });

    it('should handle invalid input gracefully', () => {
      const result1 = generateLLMsTxt(null);
      const result2 = generateLLMsTxt(undefined);
      const result3 = generateLLMsTxt({ invalid: 'object' });
      
      expect(result1).toContain('Total Documents: 0');
      expect(result2).toContain('Total Documents: 0');
      expect(result3).toContain('Total Documents: 0');
    });
  });

  describe('downloadFile', () => {
    // Note: This is difficult to test in a Node.js environment since it relies on browser APIs
    // In a real browser environment, we would test that the download is triggered
    it('should be a function', () => {
      expect(typeof downloadFile).toBe('function');
    });
  });

  describe('openContentInNewTab', () => {
    // Note: This requires browser APIs (window.open, Blob, URL)
    // In a real test environment, we would mock these browser APIs
    it('should be a function', () => {
      expect(typeof openContentInNewTab).toBe('function');
    });
  });
});