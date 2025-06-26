import { expect, it, describe } from 'vitest';
import { 
  normalizeWhitespace, 
  preserveCodeBlocks, 
  enhanceHeadings, 
  removeNavigationNoise,
  enhancedDefuddleExtraction,
  preserveDocumentStructure
} from '../src/utils/content-enhancer.js';

describe('content-enhancer', () => {
  describe('normalizeWhitespace', () => {
    it('should normalize line endings and excessive whitespace', () => {
      const input = 'Hello\r\nWorld\r\n\n\n  with   spaces  \n\n\n';
      const result = normalizeWhitespace(input);
      
      expect(result).toBe('Hello\nWorld\n\nwith spaces');
    });

    it('should preserve paragraph breaks', () => {
      const input = 'Paragraph 1\n\n\nParagraph 2\n\n\n\nParagraph 3';
      const result = normalizeWhitespace(input);
      
      expect(result).toBe('Paragraph 1\n\nParagraph 2\n\nParagraph 3');
    });

    it('should handle empty content', () => {
      expect(normalizeWhitespace(null)).toBe('');
      expect(normalizeWhitespace('')).toBe('');
      expect(normalizeWhitespace('   \n\n   ')).toBe('');
    });
  });

  describe('preserveCodeBlocks', () => {
    it('should preserve fenced code blocks with proper spacing', () => {
      const input = 'Text before```javascript\nconst x = 1;\n```Text after';
      const result = preserveCodeBlocks(input);
      
      expect(result).toContain('\n\n```javascript\nconst x = 1;\n```\n\n');
    });

    it('should preserve inline code formatting', () => {
      const input = 'Use `const   variable = value` for constants';
      const result = preserveCodeBlocks(input);
      
      expect(result).toContain('`const variable = value`');
    });

    it('should preserve indented code blocks', () => {
      const input = 'Regular text\n    const indented = "code";\n    console.log(indented);\nMore text';
      const result = preserveCodeBlocks(input);
      
      // Should add spacing around indented code blocks
      expect(result).toMatch(/\n\s+const indented = "code";\n\s+console\.log\(indented\);\n\nMore text/);
    });
  });

  describe('enhanceHeadings', () => {
    it('should normalize markdown headings', () => {
      const input = '##  Heading with spaces  ##\n### Another heading';
      const result = enhanceHeadings(input);
      
      expect(result).toContain('## Heading with spaces');
      expect(result).toContain('### Another heading');
    });

    it('should add proper spacing around headings', () => {
      const input = 'Text\n# Main Heading\nContent\n## Sub Heading\nMore content';
      const result = enhanceHeadings(input);
      
      expect(result).toMatch(/\n# Main Heading\n/);
      expect(result).toMatch(/\n## Sub Heading\n/);
    });
  });

  describe('removeNavigationNoise', () => {
    it('should remove breadcrumb navigation', () => {
      const input = 'Home > Documentation > API\nActual content here';
      const result = removeNavigationNoise(input);
      
      expect(result).not.toContain('Home > Documentation > API');
      expect(result).toContain('Actual content here');
    });

    it('should remove copyright notices', () => {
      const input = 'Good content\n© 2024 Company Name\nMore content';
      const result = removeNavigationNoise(input);
      
      expect(result).not.toContain('© 2024 Company Name');
      expect(result).toContain('Good content');
      expect(result).toContain('More content');
    });

    it('should remove "back to top" links', () => {
      const input = 'Content here\nback to top\nMore content';
      const result = removeNavigationNoise(input);
      
      expect(result).not.toContain('back to top');
    });
  });

  describe('preserveDocumentStructure', () => {
    it('should normalize headers and spacing', () => {
      const input = '##  Title  \n\n\n\nContent\n\n\n\n```code```\n\n\n\nEnd';
      const result = preserveDocumentStructure(input);
      
      expect(result).toBe('## Title\n\nContent\n\n```code```\n\nEnd');
    });

    it('should isolate code blocks', () => {
      const input = 'Text```javascript\ncode\n```Text';
      const result = preserveDocumentStructure(input);
      
      expect(result).toContain('\n```javascript\ncode\n```\n');
    });
  });

  describe('enhancedDefuddleExtraction', () => {
    it('should handle HTML string input', () => {
      const html = '<html><body><h1>Title</h1><p>Content</p></body></html>';
      
      // Mock global DOMParser for testing
      global.DOMParser = class {
        parseFromString(htmlString) {
          return {
            querySelector: () => ({ textContent: 'Title' }),
            body: { textContent: 'Title\nContent' }
          };
        }
      };
      
      const result = enhancedDefuddleExtraction(html);
      
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should fallback gracefully when Defuddle is not available', () => {
      const html = '<html><body><h1>Title</h1><p>Content</p></body></html>';
      
      global.DOMParser = class {
        parseFromString() {
          return {
            body: { textContent: 'Fallback content' }
          };
        }
      };
      
      const result = enhancedDefuddleExtraction(html, { defuddleInstance: null });
      
      expect(result).toContain('Fallback content');
    });

    it('should apply post-processing pipeline', () => {
      const html = '<html><body><h1>  Title  </h1><p>Content with   spaces</p></body></html>';
      
      global.DOMParser = class {
        parseFromString() {
          return {
            body: { textContent: '  Title  \n\nContent with   spaces\n\n\n' }
          };
        }
      };
      
      const result = enhancedDefuddleExtraction(html);
      
      // Should normalize whitespace
      expect(result).not.toContain('   spaces');
      expect(result).not.toContain('\n\n\n');
    });
  });
}); 