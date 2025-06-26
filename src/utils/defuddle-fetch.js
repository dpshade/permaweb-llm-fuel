import Defuddle from 'defuddle';

/**
 * Fetches a URL and extracts clean content using Defuddle (browser version)
 * @param {string} url - The URL to fetch and clean
 * @returns {Promise<{title: string, content: string, url: string, wordCount: number}>}
 */
export async function fetchAndClean(url) {
  try {
    // Fetch the HTML content
    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Parse HTML into a document
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Use Defuddle to extract clean content
    const defuddle = new Defuddle(doc, {
      debug: false,
      markdown: true,
      url: url,
      removeExactSelectors: true,
      removePartialSelectors: true
    });
    
    const result = defuddle.parse();
    
    // Validate content quality
    if (result.wordCount < 50) {
      throw new Error(`Content too short: ${result.wordCount} words`);
    }
    
    // Check for 404 indicators in content
    if (result.content && result.content.toLowerCase().includes('404') && 
        result.content.toLowerCase().includes('not found')) {
      throw new Error('404 page detected');
    }
    
    return {
      title: result.title || 'Untitled',
      content: result.content || '',
      url: url,
      wordCount: result.wordCount || 0,
      author: result.author || '',
      published: result.published || '',
      description: result.description || '',
      domain: result.domain || '',
      parseTime: result.parseTime || 0
    };
  } catch (error) {
    console.error(`Failed to fetch and clean ${url}:`, error);
    
    // Fallback to simple content extraction if Defuddle fails
    try {
      const response = await fetch(url);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const title = doc.querySelector('title')?.textContent || 'Untitled';
      const content = doc.body?.textContent || '';
      
      return {
        title: title.trim(),
        content: content.trim(),
        url: url,
        wordCount: content.trim().split(/\s+/).length,
        author: '',
        published: '',
        description: '',
        domain: new URL(url).hostname,
        parseTime: 0
      };
    } catch (fallbackError) {
      return {
        title: 'Error loading page',
        content: `Failed to load content from ${url}: ${error.message}`,
        url: url,
        wordCount: 0,
        author: '',
        published: '',
        description: '',
        domain: '',
        parseTime: 0
      };
    }
  }
}

/**
 * Batch fetch and clean multiple URLs with progress tracking
 * @param {string[]} urls - Array of URLs to process
 * @param {Function} onProgress - Progress callback (current, total, url)
 * @returns {Promise<Array>} Array of cleaned content objects
 */
export async function batchFetchAndClean(urls, onProgress = () => {}) {
  const results = [];
  const total = urls.length;
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    onProgress(i + 1, total, url);
    
    try {
      const result = await fetchAndClean(url);
      results.push(result);
      
      // Small delay to avoid overwhelming the server
      if (i < urls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Batch processing failed for ${url}:`, error);
      results.push({
        title: 'Processing Error',
        content: `Failed to process ${url}`,
        url: url,
        wordCount: 0,
        author: '',
        published: '',
        description: '',
        domain: '',
        parseTime: 0
      });
    }
  }
  
  return results;
}

/**
 * Generate llms.txt content from cleaned documents
 * @param {Array} documents - Array of cleaned document objects
 * @param {Object} options - Generation options
 * @returns {string} Formatted llms.txt content
 */
export function generateLLMsTxt(documents, options = {}) {
  const {
    includeMetadata = true,
    includeToc = true,
    customHeader = '',
    separator = '\n\n---\n\n'
  } = options;
  
  let content = '';
  
  // Add custom header if provided
  if (customHeader) {
    content += `${customHeader}\n\n`;
  }
  
  // Add metadata section
  if (includeMetadata) {
    const totalWords = documents.reduce((sum, doc) => sum + (doc.wordCount || 0), 0);
    const generatedAt = new Date().toISOString();
    const totalParseTime = documents.reduce((sum, doc) => sum + (doc.parseTime || 0), 0);
    
    content += `# Permaweb Documentation Collection\n\n`;
    content += `Generated: ${generatedAt}\n`;
    content += `Total Documents: ${documents.length}\n`;
    content += `Total Words: ${totalWords.toLocaleString()}\n`;
    content += `Processing Time: ${totalParseTime}ms\n`;
    content += `Source: Permaweb LLMs Builder\n`;
    content += `Extracted with: Defuddle v0.6.4\n\n`;
  }
  
  // Add table of contents
  if (includeToc && documents.length > 1) {
    content += `## Table of Contents\n\n`;
    documents.forEach((doc, index) => {
      const anchor = doc.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      content += `${index + 1}. [${doc.title}](#${anchor})\n`;
    });
    content += `\n`;
  }
  
  // Add documents
  documents.forEach((doc, index) => {
    if (index > 0) {
      content += separator;
    }
    
    content += `# ${doc.title}\n\n`;
    
    if (includeMetadata) {
      content += `**Source:** ${doc.url}\n`;
      if (doc.author) content += `**Author:** ${doc.author}\n`;
      if (doc.published) content += `**Published:** ${doc.published}\n`;
      if (doc.description) content += `**Description:** ${doc.description}\n`;
      if (doc.domain) content += `**Domain:** ${doc.domain}\n`;
      content += `**Word Count:** ${doc.wordCount.toLocaleString()}\n`;
      if (doc.parseTime > 0) content += `**Parse Time:** ${doc.parseTime}ms\n`;
      content += `\n`;
    }
    
    content += doc.content;
    
    if (!doc.content.endsWith('\n')) {
      content += '\n';
    }
  });
  
  return content;
}

/**
 * Download content as a file
 * @param {string} content - The content to download
 * @param {string} filename - The filename for the download
 * @param {string} mimeType - MIME type for the file
 */
export function downloadFile(content, filename = 'llms.txt', mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  URL.revokeObjectURL(url);
}