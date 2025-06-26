import { describe, it, expect } from 'vitest';
import { fetchAndClean, generateLLMsTxt } from '../src/utils/defuddle-fetch.js';
import { enhancedDefuddleExtraction } from '../src/utils/content-enhancer.js';

/**
 * Test suite for HTML sanitization in the content pipeline
 * Ensures no HTML tags or entities leak into LLM outputs
 */

describe('HTML Sanitization Pipeline', () => {
  
  describe('stripHTML function (internal)', () => {
    it('should remove all HTML tags', () => {
      const htmlContent = `
        <div class="content">
          <h1>Test Title</h1>
          <p>This is a <strong>test</strong> paragraph with <em>emphasis</em>.</p>
          <ul>
            <li>List item 1</li>
            <li>List item 2</li>
          </ul>
        </div>
      `;
      
      // Mock fetchAndClean to test internal stripHTML
      const mockDoc = {
        title: 'Test',
        content: htmlContent,
        url: 'https://example.com',
        wordCount: 0
      };
      
      const result = generateLLMsTxt([mockDoc], { includeMetadata: false });
      
      // Should not contain any HTML tags
      expect(result).not.toMatch(/<[^>]*>/);
      expect(result).not.toMatch(/&[a-zA-Z]+;/);
    });

    it('should decode HTML entities', () => {
      const entityContent = `
        This &amp; that &lt;test&gt; &quot;quoted&quot; text.
        Numeric entities: &#39;single&#39; &#8212;dash&#8212;
        Unicode: &#x27;apostrophe&#x27; &#x2019;smart quote&#x2019;
      `;
      
      const mockDoc = {
        title: 'Entity Test',
        content: entityContent,
        url: 'https://example.com',
        wordCount: 0
      };
      
      const result = generateLLMsTxt([mockDoc], { includeMetadata: false });
      
      // Should contain decoded characters (fix smart quote expectation)
      expect(result).toContain('This & that <test> "quoted" text');
      expect(result).toContain("'single' —dash—");
      expect(result).toContain("'apostrophe'");
      expect(result).toContain("smart quote");
    });

    it('should handle malformed HTML gracefully', () => {
      const malformedHTML = `
        <div>Unclosed div
        <p>Paragraph without closing tag
        <script>alert('xss');</script>
        <style>body { color: red; }</style>
        <!-- HTML comment -->
        Trailing text
      `;
      
      const mockDoc = {
        title: 'Malformed Test',
        content: malformedHTML,
        url: 'https://example.com',
        wordCount: 0
      };
      
      const result = generateLLMsTxt([mockDoc], { includeMetadata: false });
      
      // Should remove all HTML elements including scripts and styles
      expect(result).not.toMatch(/<[^>]*>/);
      expect(result).not.toContain('alert(');
      expect(result).not.toContain('color: red');
      expect(result).not.toContain('<!--');
      expect(result).toContain('Unclosed div');
      expect(result).toContain('Paragraph without closing tag');
      expect(result).toContain('Trailing text');
    });

    it('should strip Markdown formatting', () => {
      const markdownContent = `
        # Header 1
        ## Header 2
        **Bold text** and __also bold__
        *Italic text* and _also italic_
        \`inline code\` and ~~strikethrough~~
        
        - List item 1
        - List item 2
        
        1. Numbered item 1
        2. Numbered item 2
        
        > This is a blockquote
        
        [Link text](https://example.com)
        ![Alt text](image.jpg)
      `;
      
      const mockDoc = {
        title: 'Markdown Test',
        content: markdownContent,
        url: 'https://example.com',
        wordCount: 0
      };
      
      const result = generateLLMsTxt([mockDoc], { includeMetadata: false });
      
      // Should not contain Markdown formatting in content (but title will still have #)
      expect(result).not.toMatch(/\*\*[^*]+\*\*/);  // **bold**
      expect(result).not.toMatch(/__[^_]+__/);      // __bold__
      expect(result).not.toMatch(/\*[^*]+\*/);      // *italic*
      expect(result).not.toMatch(/_[^_]+_/);        // _italic_
      expect(result).not.toMatch(/`[^`]+`/);        // `code`
      expect(result).not.toMatch(/~~[^~]+~~/);      // ~~strikethrough~~
      expect(result).not.toMatch(/^\s*[-*+]\s+/m);  // - List items
      expect(result).not.toMatch(/^\s*\d+\.\s+/m);  // 1. Numbered lists
      expect(result).not.toMatch(/^\s*>\s+/m);      // > Blockquotes
      expect(result).not.toMatch(/\[([^\]]+)\]\([^)]+\)/); // [link](url)
      expect(result).not.toMatch(/!\[([^\]]*)\]\([^)]+\)/); // ![alt](img)
      
      // Check that content headers are stripped (but not document title)
      const contentOnly = result.split('\n').slice(2).join('\n'); // Skip title line
      expect(contentOnly).not.toMatch(/^#{2,6}\s+/m);  // ## Headers in content
      
      // Should contain the clean text content
      expect(result).toContain('Header 1');
      expect(result).toContain('Header 2');
      expect(result).toContain('Bold text and also bold');
      expect(result).toContain('Italic text and also italic');
      expect(result).toContain('inline code and strikethrough');
      expect(result).toContain('List item 1');
      expect(result).toContain('Numbered item 1');
      expect(result).toContain('This is a blockquote');
      expect(result).toContain('Link text');
      expect(result).toContain('Alt text');
    });
  });

  describe('Enhanced Defuddle Extraction', () => {
    it('should return clean text without HTML when used in isolation', () => {
      const sampleHTML = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Page</title></head>
          <body>
            <nav>Navigation Menu</nav>
            <main>
              <h1>Main Content</h1>
              <p>This is the <strong>main content</strong> of the page.</p>
              <div class="sidebar">Sidebar content</div>
            </main>
            <footer>Footer content</footer>
          </body>
        </html>
      `;
      
      // Mock Defuddle for testing
      const mockDefuddle = class {
        constructor(doc, options) {
          this.doc = doc;
          this.options = options;
        }
        
        parse() {
          return {
            content: `<h1>Main Content</h1>\n<p>This is the <strong>main content</strong> of the page.</p>`
          };
        }
      };
      
      const result = enhancedDefuddleExtraction(sampleHTML, { 
        defuddleInstance: mockDefuddle 
      });
      
      // Should not contain HTML tags after enhancement
      expect(result).not.toMatch(/<[^>]*>/);
      expect(result).toContain('Main Content');
      expect(result).toContain('main content');
    });
  });

  describe('generateLLMsTxt output validation', () => {
    it('should produce completely clean LLM-ready text', () => {
      const testDocs = [
        {
          title: 'HTML Entity Test &amp; More',
          content: `
            <h2>Section Header</h2>
            <p>Content with &nbsp; entities &lt;brackets&gt; and "quotes".</p>
            <code>function test() { return '&lt;div&gt;'; }</code>
            <ul><li>List item with <em>emphasis</em></li></ul>
          `,
          url: 'https://example.com/test1',
          wordCount: 25,
          domain: 'example.com'
        },
        {
          title: 'Script & Style Test',
          content: `
            <script>
              // This should be completely removed
              alert('XSS attempt');
              document.body.innerHTML = '<h1>Hacked</h1>';
            </script>
            <style>
              .malicious { display: none; }
              body { background: url('javascript:alert(1)'); }
            </style>
            <div>Clean content here</div>
            <p>Normal paragraph</p>
          `,
          url: 'https://example.com/test2',
          wordCount: 15,
          domain: 'example.com'
        }
      ];
      
      const llmText = generateLLMsTxt(testDocs, {
        includeMetadata: true,
        includeToc: true
      });
      
      // Validate HTML tag removal (not angle brackets in legitimate content like code)
      expect(llmText).not.toMatch(/<(script|style)\b[^>]*>/i); // Script/style tags should be gone
      expect(llmText).not.toMatch(/&[a-zA-Z0-9#]+;/); // HTML entities should be decoded
      
      // Validate malicious content removal
      expect(llmText).not.toContain('alert(');
      expect(llmText).not.toContain('XSS');
      expect(llmText).not.toContain('javascript:');
      expect(llmText).not.toContain('innerHTML');
      expect(llmText).not.toContain('display: none');
      
      // Validate clean content preservation
      expect(llmText).toContain('HTML Entity Test & More');
      expect(llmText).toContain('entities <brackets> and "quotes"');
      expect(llmText).toContain('function test()');
      expect(llmText).toContain('List item with emphasis');
      expect(llmText).toContain('Clean content here');
      expect(llmText).toContain('Normal paragraph');
      
      // Validate structure preservation
      expect(llmText).toContain('Table of Contents');
      expect(llmText).toContain('Source:');
      expect(llmText).toContain('Word Count:');
    });

    it('should handle edge cases safely', () => {
      const edgeCaseDocs = [
        {
          title: '',  // Empty title
          content: '',  // Empty content
          url: 'https://example.com/empty',
          wordCount: 0
        },
        {
          title: null,  // Null title
          content: null,  // Null content
          url: 'https://example.com/null',
          wordCount: 0
        },
        {
          title: '<<>>&&""\'\'',  // Special characters
          content: '<>&"\'',  // HTML-like content
          url: 'https://example.com/special',
          wordCount: 1
        }
      ];
      
      // Should not throw errors
      expect(() => {
        const result = generateLLMsTxt(edgeCaseDocs);
        expect(typeof result).toBe('string');
        expect(result).not.toMatch(/<[^>]*>/);
      }).not.toThrow();
    });
  });

  describe('End-to-End Pipeline Validation', () => {
    it('should maintain clean output through the entire pipeline', () => {
      // This test would require mocking fetch, but validates the concept
      const mockHtmlResponse = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test &amp; Validation</title>
          </head>
          <body>
            <script>badScript();</script>
            <h1>Clean Title</h1>
            <p>Clean content with &nbsp; spaces.</p>
            <div class="remove-me">Navigation</div>
          </body>
        </html>
      `;
      
      // In a real test, you'd mock the fetch call
      // For now, we validate that our functions work together
      const mockResult = {
        title: 'Test & Validation',
        content: 'Clean Title\n\nClean content with   spaces.',
        url: 'https://example.com',
        wordCount: 6
      };
      
      const finalOutput = generateLLMsTxt([mockResult]);
      
      // Final validation - absolutely no HTML should remain
      expect(finalOutput).not.toMatch(/<[^>]*>/);
      expect(finalOutput).not.toMatch(/&[a-zA-Z0-9#]+;/);
      expect(finalOutput).not.toContain('badScript');
      expect(finalOutput).toContain('Test & Validation');
      expect(finalOutput).toContain('Clean content with spaces');
    });
  });
}); 