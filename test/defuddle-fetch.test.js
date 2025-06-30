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
      expect(result).toContain('Author: Test Author');
      expect(result).toContain('Source: https://example.com/doc1');
      expect(result).toContain('Domain: example.com');
      expect(result).toContain('Word Count: 6');
      expect(result).toContain('Parse Time: 150ms');
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
      expect(result).toContain('Source: https://example.com/minimal');
      expect(result).toContain('Word Count: 3');
      expect(result).not.toContain('Author:');
      expect(result).not.toContain('Published:');
      expect(result).not.toContain('Domain:');
      expect(result).not.toContain('Parse Time:');
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

  describe('HTML stripping improvements', () => {
    it('should preserve structural formatting while removing visual formatting', () => {
      const mockDocuments = [
        {
          title: 'Important Document with Formatting',
          content: `
            <h1>Main Title</h1>
            <p>This is a <strong>bold</strong> paragraph with <em>italic</em> text.</p>
            <p>Here is some <code>code</code> and a <a href="https://example.com">link</a>.</p>
            <ul>
              <li>List item 1</li>
              <li>List item 2</li>
            </ul>
            <blockquote>This is a quote</blockquote>
            <p>Technical terms like user_name, file_path, and API_endpoint should keep underscores.</p>
            <p>But <em>this should be italic</em> and <strong>this should be bold</strong>.</p>
          `,
          url: 'https://example.com/formatted',
          wordCount: 50,
          domain: 'example.com'
        }
      ];

      const result = generateLLMsTxt(mockDocuments, { includeMetadata: false });
      
      // Should preserve structural formatting
      expect(result).toContain('# Main Title');
      expect(result).toContain('Here is some `code`');
      expect(result).toContain('• List item 1');
      expect(result).toContain('• List item 2');
      expect(result).toContain('> This is a quote');
      
      // Should preserve underscores in technical terms
      expect(result).toContain('user_name');
      expect(result).toContain('file_path');
      expect(result).toContain('API_endpoint');
      
      // Should remove visual formatting (bold/italic)
      expect(result).not.toContain('**bold**');
      expect(result).not.toContain('*italic*');
      expect(result).toContain('bold'); // Content should remain, just not formatted
      expect(result).toContain('italic'); // Content should remain, just not formatted
      
      // Should not contain raw HTML tags
      expect(result).not.toContain('<strong>');
      expect(result).not.toContain('<em>');
      expect(result).not.toContain('<h1>');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<ul>');
      expect(result).not.toContain('<li>');
      expect(result).not.toContain('<blockquote>');
    });

    it('should handle security threats while preserving content', () => {
      const mockDocuments = [
        {
          title: 'Security Test Document',
          content: `
            <p>Normal content here.</p>
            <script>alert('malicious');</script>
            <p>More normal content.</p>
            <style>body { display: none; }</style>
            <p>Content with javascript:alert('test') and onclick="alert('test')"</p>
            <p>Technical content with underscores: user_name, file_path, API_endpoint</p>
            <p>But also <em>italic text</em> and <strong>bold text</strong></p>
          `,
          url: 'https://example.com/security-test',
          wordCount: 20,
          domain: 'example.com'
        }
      ];

      const result = generateLLMsTxt(mockDocuments, { includeMetadata: false });
      
      // Should contain normal content
      expect(result).toContain('Normal content here.');
      expect(result).toContain('More normal content.');
      expect(result).toContain('Technical content with underscores: user_name, file_path, API_endpoint');
      expect(result).toContain('italic text'); // Content preserved, formatting removed
      expect(result).toContain('bold text'); // Content preserved, formatting removed
      
      // Should remove malicious content
      expect(result).not.toContain('alert(\'malicious\')');
      expect(result).not.toContain('display: none');
      expect(result).not.toContain('javascript:alert');
      expect(result).not.toContain('onclick=');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('<style>');
    });

    it('should handle complex HTML structures correctly', () => {
      const mockDocuments = [
        {
          title: 'Complex HTML Test',
          content: [
            '<div class="container">',
            '  <header>',
            '    <h1>Page Title</h1>',
            '    <nav><a href="/home">Home</a> | <a href="/about">About</a></nav>',
            '  </header>',
            '  <main>',
            '    <article>',
            '      <h2>Article Title</h2>',
            '      <p>This is a <strong>complex</strong> article with <em>multiple</em> elements.</p>',
            '      <pre><code>function test() {',
            '  console.log(\'Hello World\');',
            '}</code></pre>',
            '      <table>',
            '        <tr><th>Header 1</th><th>Header 2</th></tr>',
            '        <tr><td>Data 1</td><td>Data 2</td></tr>',
            '      </table>',
            '    </article>',
            '  </main>',
            '</div>'
          ].join('\n'),
          url: 'https://example.com/complex',
          wordCount: 30,
          domain: 'example.com'
        }
      ];

      const result = generateLLMsTxt(mockDocuments, { includeMetadata: false });
      
      // Should preserve structural formatting
      expect(result).toContain('# Page Title');
      expect(result).toContain('## Article Title');
      expect(result).toContain('This is a complex article with multiple elements.'); // Content preserved, formatting removed
      expect(result).toContain('```\nfunction test() {\n  console.log(\'Hello World\');\n}\n```');
      
      // Should not contain raw HTML
      expect(result).not.toContain('<div');
      expect(result).not.toContain('<header>');
      expect(result).not.toContain('<nav>');
      expect(result).not.toContain('<main>');
      expect(result).not.toContain('<article>');
    });

    it('should handle edge cases and special characters', () => {
      const mockDocuments = [
        {
          title: 'Edge Cases Test',
          content: `
            <p>Content with &amp; &lt; &gt; &quot; entities</p>
            <p>Content with _single_underscores_ and __double__underscores__</p>
            <p>Content with *asterisks* and **double**asterisks**</p>
            <p>Content with backticks and triple backticks</p>
            <p>Content with [brackets] and (parentheses)</p>
            <p>Content with user_name, file_path, API_endpoint</p>
            <p>Content with <em>_italic_underscores_</em> and <strong>**bold_asterisks**</strong></p>
          `,
          url: 'https://example.com/edge-cases',
          wordCount: 25,
          domain: 'example.com'
        }
      ];

      const result = generateLLMsTxt(mockDocuments, { includeMetadata: false });
      
      // Should decode HTML entities
      expect(result).toContain('Content with & < > " entities');
      
      // Should preserve technical terms with underscores
      expect(result).toContain('user_name');
      expect(result).toContain('file_path');
      expect(result).toContain('API_endpoint');
      
      // Should preserve underscores in all contexts
      expect(result).toContain('_single_underscores_');
      expect(result).toContain('__double__underscores__');
      expect(result).toContain('_italic_underscores_');
      expect(result).toContain('**bold_asterisks**');
      
      // Should preserve special characters in context
      expect(result).toContain('[brackets]');
      expect(result).toContain('(parentheses)');
    });
  });
});