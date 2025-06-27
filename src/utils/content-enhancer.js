/**
 * Content Enhancement Module for LLM-Optimized Content Processing
 * Provides post-processing pipeline for extracted content to improve LLM performance
 */

/**
 * Normalize whitespace while preserving document structure
 * @param {string} content - Raw content to normalize
 * @returns {string} Normalized content
 */
function normalizeWhitespace(content) {
  if (!content) return '';
  
  return content
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove trailing whitespace from lines
    .replace(/[ \t]+$/gm, '')
    // Remove leading whitespace from lines except those starting with 4+ spaces (code blocks)
    .replace(/^[ \t]+(?![ \t]{3})/gm, '')
    // Preserve paragraph breaks (double newlines) - collapse multiple newlines to double
    .replace(/\n{3,}/g, '\n\n')
    // Clean up excessive spaces within lines
    .replace(/[ \t]+/g, ' ')
    // Remove leading whitespace from start of content
    .replace(/^\s+/, '')
    // Remove trailing whitespace from end of content
    .replace(/\s+$/, '');
}

/**
 * Preserve and enhance code blocks for better LLM understanding
 * @param {string} content - Content that may contain code blocks
 * @returns {string} Content with preserved code blocks
 */
function preserveCodeBlocks(content) {
  if (!content) return '';
  
  // Preserve fenced code blocks (```...```)
  content = content.replace(/```[\s\S]*?```/g, (match) => {
    // Ensure code blocks are isolated with proper spacing
    return `\n\n${match.trim()}\n\n`;
  });
  
  // Preserve inline code (`...`)
  content = content.replace(/`[^`\n]+`/g, (match) => {
    // Ensure inline code doesn't break on spaces
    return match.replace(/\s+/g, ' ');
  });
  
  // Preserve indented code blocks (4+ spaces)
  const lines = content.split('\n');
  let inCodeBlock = false;
  const processedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isCodeLine = /^    \S/.test(line); // 4+ spaces followed by non-whitespace
    
    if (isCodeLine && !inCodeBlock) {
      // Starting a code block - add spacing before if previous line isn't empty
      inCodeBlock = true;
      if (processedLines.length > 0 && processedLines[processedLines.length - 1].trim() !== '') {
        processedLines.push(''); // Add spacing before code block
      }
      processedLines.push(line);
    } else if (!isCodeLine && inCodeBlock) {
      // Ending a code block
      inCodeBlock = false;
      if (line.trim() !== '') {
        processedLines.push(''); // Add spacing after code block
        processedLines.push(line);
      } else {
        processedLines.push(line);
      }
    } else {
      processedLines.push(line);
    }
  }
  
  return processedLines.join('\n');
}

/**
 * Enhance heading structure for better document hierarchy
 * @param {string} content - Content with headings
 * @returns {string} Content with enhanced headings
 */
function enhanceHeadings(content) {
  if (!content) return '';
  
  return content
    // Normalize markdown headings
    .replace(/^(#{1,6})\s*(.+?)\s*#*$/gm, (match, hashes, text) => {
      // Clean up heading text and ensure proper spacing
      const cleanText = text.trim();
      return `${hashes} ${cleanText}`;
    })
    // Ensure headings have proper spacing
    .replace(/^(#{1,6}\s+.+)$/gm, (match) => {
      return `\n${match}\n`;
    })
    // Clean up multiple consecutive newlines after headings
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Remove navigation and UI noise from content
 * @param {string} content - Content that may contain navigation
 * @returns {string} Content with navigation removed
 */
function removeNavigationNoise(content) {
  if (!content) return '';
  
  // Common navigation patterns to remove
  const navigationPatterns = [
    // Breadcrumb navigation
    /^.*?Home\s*[>»→]\s*.*?[>»→].*$/gm,
    /^.*?breadcrumb.*$/gmi,
    
    // Skip to content links
    /skip\s+to\s+(main\s+)?content/gi,
    
    // Navigation menus
    /^(menu|navigation|nav|sidebar)$/gmi,
    
    // Copyright and footer content
    /^.*?©.*?\d{4}.*$/gm,
    /^.*?copyright.*?\d{4}.*$/gmi,
    
    // "Back to top" links
    /back\s+to\s+top/gi,
    /↑.*?top/gi,
    
    // Print/share buttons
    /print\s+this\s+page/gi,
    /share\s+this/gi,
    
    // Cookie notices (common patterns)
    /this\s+site\s+uses\s+cookies/gi,
    /we\s+use\s+cookies/gi,
    
    // Edit page links
    /edit\s+this\s+page/gi,
    /edit\s+on\s+github/gi
  ];
  
  let cleanContent = content;
  
  navigationPatterns.forEach(pattern => {
    cleanContent = cleanContent.replace(pattern, '');
  });
  
  // Remove lines that are likely navigation (short lines with common nav words)
  cleanContent = cleanContent.replace(/^.{0,50}(home|about|contact|blog|news|search|login|register|menu).*$/gmi, '');
  
  // Clean up any resulting multiple newlines
  return cleanContent.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Enhanced defuddle extraction with LLM-specific optimizations
 * @param {string} html - Raw HTML content
 * @param {Object} options - Extraction options
 * @returns {string} Enhanced and optimized content
 */
export function enhancedDefuddleExtraction(html, options = {}) {
  const defuddleOptions = {
    ...options,
    preserveStructure: true,
    removeRedundancy: true,
    enhanceReadability: true,
    markdown: true,
    debug: false
  };
  
  // Import Defuddle dynamically since it might not be available in all environments
  let defuddleResult;
  try {
    // This would need to be adjusted based on how Defuddle is imported in your environment
    const Defuddle = options.defuddleInstance || globalThis.Defuddle;
    if (!Defuddle) {
      throw new Error('Defuddle not available');
    }
    
    // Parse HTML if it's a string, but only if DOMParser is available
    let doc = html;
    if (typeof html === 'string' && typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      doc = parser.parseFromString(html, 'text/html');
    }
    
    const defuddle = new Defuddle(doc, defuddleOptions);
    defuddleResult = defuddle.parse();
    
    defuddleResult = defuddleResult.content || '';
  } catch (error) {
    console.warn('Enhanced extraction fallback:', error.message);
    // Fallback to basic text extraction with HTML stripping
    if (typeof html === 'string') {
      let rawText = html;
      
      // Try DOM parsing if available, otherwise use regex
      if (typeof DOMParser !== 'undefined') {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          rawText = doc.body?.textContent || html;
        } catch (domError) {
          console.warn('DOM parsing failed, using regex fallback');
        }
      }
      
      // Strip any remaining HTML tags using regex fallback
      defuddleResult = rawText
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&[^;]+;/g, ' ');
    } else {
      let rawText = html.textContent || '';
      defuddleResult = rawText.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
    }
  }
  
  // Strip HTML from the result to ensure clean output
  defuddleResult = stripHTML(defuddleResult);
  
  // Apply post-processing pipeline for LLM optimization
  let content = defuddleResult;
  
  content = normalizeWhitespace(content);
  content = preserveCodeBlocks(content);
  content = enhanceHeadings(content);
  content = removeNavigationNoise(content);
  
  return content.trim();
}

/**
 * Simple HTML stripping function for content enhancement
 * @param {string} text - Text that may contain HTML
 * @returns {string} Clean text without HTML
 */
function stripHTML(text) {
  if (!text) return '';
  
  return text
    // Remove script and style content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove HTML entities
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Preserve document structure while cleaning content
 * @param {string} content - Content to structure
 * @returns {string} Structured content
 */
export function preserveDocumentStructure(content) {
  if (!content) return '';
  
  return content
    // Normalize headers (remove trailing spaces and ensure proper spacing after)
    .replace(/^(#{1,6})\s+(.+?)(\s*)$/gm, '$1 $2')
    // Add spacing after headers
    .replace(/^(#{1,6}\s+.+)$/gm, '$1\n')
    // Isolate code blocks with proper spacing
    .replace(/```[\s\S]*?```/g, (match) => `\n${match}\n`)
    // Normalize paragraph spacing
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading/trailing whitespace
    .trim();
}

export {
  normalizeWhitespace,
  preserveCodeBlocks,
  enhanceHeadings,
  removeNavigationNoise
}; 