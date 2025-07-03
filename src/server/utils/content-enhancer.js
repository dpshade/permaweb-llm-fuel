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
    markdown: true, // Convert to Markdown for cleaner text output
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
    // Remove navigation and UI elements
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    // Remove common UI text patterns
    .replace(/Sorry, your browser doesn't support embedded video/gi, '')
    .replace(/Scroll For More/gi, '')
    .replace(/Learn More About/gi, '')
    .replace(/Made with.*cyberspace/gi, '')
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove HTML entities
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    // Remove paragraph symbol specifically
    .replace(/&para;/g, '')
    // Remove other common problematic entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
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

/**
 * Content Enhancer - Unified content extraction and cleaning
 * Provides consistent content extraction with enhanced artifact detection
 */

/**
 * Enhanced content extraction with artifact detection
 */
export class ContentEnhancer {
  constructor(options = {}) {
    this.options = {
      removeScripts: true,
      removeStyles: true,
      removeComments: true,
      removeEmptyElements: true,
      minWordCount: 50,
      maxCodeBlockLength: 1000,
      preserveCodeBlocks: true,
      ...options
    };
  }

  /**
   * Extract and clean content from HTML
   */
  async extractContent(html, url, config = {}) {
    try {
      // Use environment-appropriate DOM parser
      let doc;
      if (typeof window === 'undefined') {
        // Node.js environment
        const { JSDOM } = await import('jsdom');
        const dom = new JSDOM(html, { url });
        doc = dom.window.document;
      } else {
        // Browser environment - use DOMParser
        const parser = new DOMParser();
        doc = parser.parseFromString(html, 'text/html');
      }
      
      // Extract title
      const title = this.extractTitle(doc, config);
      
      // Extract content using multiple strategies
      const content = await this.extractMainContent(doc, config);
      
      // Apply content filters
      const cleanedContent = this.applyContentFilters(content, config);
      
      // Validate content quality
      const qualityCheck = this.validateContent(cleanedContent, config);
      
      if (!qualityCheck.isValid) {
        throw new Error(`Content quality check failed: ${qualityCheck.reason}`);
      }
      
      return {
        title,
        content: cleanedContent,
        url,
        wordCount: qualityCheck.wordCount,
        qualityScore: qualityCheck.score,
        lastModified: new Date().toISOString()
      };
      
    } catch (error) {
      throw new Error(`Content extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract title from document
   */
  extractTitle(doc, config) {
    const titleSelectors = (config.selectors?.title || 'h1, title').split(',').map(s => s.trim());
    
    for (const selector of titleSelectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent.trim()) {
        return this.cleanTitle(element.textContent.trim());
      }
    }
    
    // Fallback to URL-based title
    return this.generateTitleFromUrl(config.url || '');
  }

  /**
   * Extract main content using multiple strategies
   */
  async extractMainContent(doc, config) {
    // Strategy 1: Try Defuddle if available
    try {
      const { Defuddle } = await import('defuddle');
      const defuddle = new Defuddle(doc, {
        markdown: true, // Convert to Markdown for cleaner text output
        debug: false
      });
      
      const result = defuddle.parse();
      if (result && result.content) {
        const content = result.content;
        const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
        
        if (wordCount >= this.options.minWordCount) {
          return content;
        }
      }
    } catch (error) {
      // Defuddle not available or failed, continue to manual extraction
    }
    
    // Strategy 2: Manual content extraction
    const contentSelectors = (config.selectors?.content || 'main, .content, article, [role="main"]').split(',').map(s => s.trim());
    
    for (const selector of contentSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const content = element.textContent || '';
        const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
        
        if (wordCount >= this.options.minWordCount) {
          return content.replace(/\s+/g, ' ').trim();
        }
      }
    }
    
    // Strategy 3: Fallback to body content
    const bodyContent = doc.body?.textContent || '';
    return bodyContent.replace(/\s+/g, ' ').trim();
  }

  /**
   * Apply comprehensive content filters
   */
  applyContentFilters(content, config) {
    if (!content) return content;
    
    let filteredContent = content;
    const filters = { ...this.options, ...config.contentFilters };
    
    // Remove JavaScript artifacts
    if (filters.removeScripts) {
      filteredContent = this.removeJavaScriptArtifacts(filteredContent);
    }
    
    // Remove CSS and styles
    if (filters.removeStyles) {
      filteredContent = this.removeStyleArtifacts(filteredContent);
    }
    
    // Remove comments
    if (filters.removeComments) {
      filteredContent = this.removeComments(filteredContent);
    }
    
    // Remove empty elements and normalize whitespace
    if (filters.removeEmptyElements) {
      filteredContent = this.normalizeWhitespace(filteredContent);
    }
    
    // Limit code block length
    if (filters.maxCodeBlockLength) {
      filteredContent = this.limitCodeBlockLength(filteredContent, filters.maxCodeBlockLength);
    }
    
    return filteredContent.trim();
  }

  /**
   * Remove JavaScript artifacts while preserving legitimate code documentation
   */
  removeJavaScriptArtifacts(content) {
    let filtered = content;
    
    // Remove Next.js specific patterns
    filtered = filtered.replace(/self\.__next_f\.push\([^)]*\)/g, '');
    filtered = filtered.replace(/\[\"\$[^\"]*\",[^\]]*\]/g, '');
    filtered = filtered.replace(/\"\$\d+\"/g, '');
    filtered = filtered.replace(/\"\$L[^\"]*\"/g, '');
    filtered = filtered.replace(/\"\$undefined\"/g, '');
    filtered = filtered.replace(/\"\$S[^\"]*\"/g, '');
    filtered = filtered.replace(/\"\$1[^\"]*\"/g, '');
    filtered = filtered.replace(/\"\$L\d+\"/g, '');
    filtered = filtered.replace(/\"\$L[a-zA-Z0-9]+\"/g, '');
    
    // Remove React/Next.js component patterns
    filtered = filtered.replace(/\[\"\$\",\"\$[^\"]*\",[^\]]*\]/g, '');
    filtered = filtered.replace(/\[\"\$\",\"html\",[^\]]*\]/g, '');
    filtered = filtered.replace(/\[\"\$\",\"\$L[^\"]*\",[^\]]*\]/g, '');
    
    // Remove template patterns
    filtered = filtered.replace(/templateStyles.*?\"\$undefined\"/g, '');
    filtered = filtered.replace(/templateScripts.*?\"\$undefined\"/g, '');
    filtered = filtered.replace(/notFound.*?\"\$undefined\"/g, '');
    filtered = filtered.replace(/forbidden.*?\"\$undefined\"/g, '');
    filtered = filtered.replace(/unauthorized.*?\"\$undefined\"/g, '');
    
    // Remove specific AR.IO site patterns
    filtered = filtered.replace(/else\s*\}\s*else\s*if\s*\([^)]*\)/g, '');
    filtered = filtered.replace(/if\s*\([^)]*===\s*['"]light['"]\|\|[^)]*===\s*['"]dark['"]\)/g, '');
    filtered = filtered.replace(/d\.style\.colorScheme\s*=\s*[^;]+/g, '');
    filtered = filtered.replace(/catch\s*\([^)]*\)\s*\{\s*\}\s*\}\s*\(\)/g, '');
    
    // Remove inline JavaScript patterns (but preserve code blocks)
    filtered = filtered.replace(/import\s+from\s+["'][^"']*["']/g, '');
    filtered = filtered.replace(/const\s+\w+\s*=\s*[^;]+;/g, '');
    filtered = filtered.replace(/function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g, '');
    filtered = filtered.replace(/async\s+function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g, '');
    filtered = filtered.replace(/=>\s*\{[^}]*\}/g, '');
    filtered = filtered.replace(/\.catch\([^)]*\)/g, '');
    filtered = filtered.replace(/\.then\([^)]*\)/g, '');
    
    // Remove common non-content patterns
    filtered = filtered.replace(/CopyCopied!/g, '');
    filtered = filtered.replace(/Find something\.\.\./g, '');
    
    return filtered;
  }

  /**
   * Remove CSS and style artifacts
   */
  removeStyleArtifacts(content) {
    let filtered = content;
    
    // Remove inline styles and classes
    filtered = filtered.replace(/style\s*=\s*["'][^"']*["']/g, '');
    filtered = filtered.replace(/class\s*=\s*["'][^"']*["']/g, '');
    
    return filtered;
  }

  /**
   * Remove HTML and JavaScript comments
   */
  removeComments(content) {
    let filtered = content;
    
    filtered = filtered.replace(/<!--[\s\S]*?-->/g, '');
    filtered = filtered.replace(/\/\*[\s\S]*?\*\//g, '');
    filtered = filtered.replace(/\/\/.*$/gm, '');
    
    return filtered;
  }

  /**
   * Normalize whitespace
   */
  normalizeWhitespace(content) {
    return content
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/gm, '');
  }

  /**
   * Limit code block length
   */
  limitCodeBlockLength(content, maxLength) {
    return content.replace(/```[\s\S]*?```/g, (match) => {
      if (match.length > maxLength) {
        return match.substring(0, maxLength) + '...';
      }
      return match;
    });
  }

  /**
   * Validate content quality
   */
  validateContent(content, config) {
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    const minWords = config.minWordCount || this.options.minWordCount;
    
    // Check for 404 indicators
    const contentLower = content.toLowerCase();
    const has404Indicators = contentLower.includes('404') && 
      (contentLower.includes('not found') || contentLower.includes('page not found'));
    
    if (has404Indicators && wordCount < 200) {
      return {
        isValid: false,
        reason: '404 page detected',
        wordCount,
        score: 0
      };
    }
    
    // Check minimum word count
    if (wordCount < minWords) {
      return {
        isValid: false,
        reason: `Content too short: ${wordCount} words (minimum: ${minWords})`,
        wordCount,
        score: wordCount / minWords
      };
    }
    
    // Calculate quality score
    const score = Math.min(1.0, wordCount / 500); // Normalize to 500 words = 1.0
    
    return {
      isValid: true,
      reason: 'Content meets quality requirements',
      wordCount,
      score
    };
  }

  /**
   * Clean title text
   */
  cleanTitle(title) {
    return title
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .substring(0, 200);
  }

  /**
   * Generate title from URL
   */
  generateTitleFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1];
      
      if (lastPart) {
        return lastPart
          .replace(/[-_]/g, ' ')
          .replace(/\.(html?|php|aspx?)$/i, '')
          .replace(/\b\w/g, l => l.toUpperCase());
      }
      
      return urlObj.hostname.replace(/^www\./, '');
    } catch (error) {
      return 'Untitled';
    }
  }
}

/**
 * Create a content enhancer instance with default settings
 */
export function createContentEnhancer(options = {}) {
  return new ContentEnhancer(options);
} 