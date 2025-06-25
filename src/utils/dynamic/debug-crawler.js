/**
 * Debug version of the crawler to test CORS and basic functionality
 */

export async function testCrawling() {
  console.log('🔍 Starting debug crawl test...');
  
  // Test basic fetch to one of the sites
  const testUrl = 'https://cookbook_ao.arweave.net/welcome';
  
  try {
    console.log(`Testing fetch to: ${testUrl}`);
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      mode: 'cors'
    });
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, response.headers);
    
    if (response.ok) {
      const html = await response.text();
      console.log(`HTML length: ${html.length}`);
      console.log(`HTML preview:`, html.substring(0, 200));
      
      // Test DOM parsing
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const title = doc.querySelector('title')?.textContent || 'No title found';
      const h1 = doc.querySelector('h1')?.textContent || 'No h1 found';
      const links = doc.querySelectorAll('a[href]').length;
      
      console.log(`Parsed title: ${title}`);
      console.log(`Parsed h1: ${h1}`);
      console.log(`Found ${links} links`);
      
      return {
        success: true,
        url: testUrl,
        title,
        h1,
        links,
        htmlLength: html.length
      };
      
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
  } catch (error) {
    console.error('❌ Direct fetch failed:', error);
    
    // Try with CORS proxy
    try {
      console.log('🔄 Trying with CORS proxy...');
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(testUrl)}`;
      
      const proxyResponse = await fetch(proxyUrl);
      
      if (proxyResponse.ok) {
        const data = await proxyResponse.json();
        console.log(`Proxy response status: ${data.status}`);
        
        if (data.contents) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(data.contents, 'text/html');
          
          const title = doc.querySelector('title')?.textContent || 'No title found';
          const h1 = doc.querySelector('h1')?.textContent || 'No h1 found';
          const links = doc.querySelectorAll('a[href]').length;
          
          console.log(`✅ Proxy success!`);
          console.log(`Parsed title: ${title}`);
          console.log(`Parsed h1: ${h1}`);
          console.log(`Found ${links} links`);
          
          return {
            success: true,
            url: testUrl,
            title,
            h1,
            links,
            htmlLength: data.contents.length,
            usedProxy: true
          };
        }
      }
      
      throw new Error(`Proxy failed: ${proxyResponse.status}`);
      
    } catch (proxyError) {
      console.error('❌ Proxy also failed:', proxyError);
      
      return {
        success: false,
        error: `Both direct fetch and proxy failed. Direct: ${error.message}, Proxy: ${proxyError.message}`,
        url: testUrl
      };
    }
  }
}

export async function testMultipleSites() {
  console.log('🔍 Testing multiple sites...');
  
  const testUrls = [
    'https://cookbook_ao.arweave.net/welcome',
    'https://cookbook.arweave.net/getting-started',
    'https://hyperbeam.arweave.net/build'
  ];
  
  const results = [];
  
  for (const url of testUrls) {
    console.log(`\n--- Testing ${url} ---`);
    try {
      const result = await testSingleUrl(url);
      results.push(result);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Failed to test ${url}:`, error);
      results.push({
        success: false,
        url,
        error: error.message
      });
    }
  }
  
  console.log('\n📊 Test Summary:');
  console.log(`Total sites tested: ${results.length}`);
  console.log(`Successful: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  
  return results;
}

async function testSingleUrl(url) {
  try {
    // Try direct fetch first
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PermawebLLMsBuilder/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      mode: 'cors'
    });
    
    if (response.ok) {
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      return {
        success: true,
        url,
        title: doc.querySelector('title')?.textContent || 'No title',
        h1: doc.querySelector('h1')?.textContent || 'No h1',
        links: doc.querySelectorAll('a[href]').length,
        method: 'direct'
      };
    }
    
    throw new Error(`HTTP ${response.status}`);
    
  } catch (directError) {
    // Try proxy
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const proxyResponse = await fetch(proxyUrl);
      
      if (proxyResponse.ok) {
        const data = await proxyResponse.json();
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents, 'text/html');
        
        return {
          success: true,
          url,
          title: doc.querySelector('title')?.textContent || 'No title',
          h1: doc.querySelector('h1')?.textContent || 'No h1',
          links: doc.querySelectorAll('a[href]').length,
          method: 'proxy'
        };
      }
      
      throw new Error(`Proxy HTTP ${proxyResponse.status}`);
      
    } catch (proxyError) {
      return {
        success: false,
        url,
        error: `Direct: ${directError.message}, Proxy: ${proxyError.message}`
      };
    }
  }
}

// Simple mock data for testing UI without crawling
export function getMockData() {
  return {
    ao: {
      siteKey: 'ao',
      name: 'AO Cookbook',
      pages: [
        {
          url: 'https://cookbook_ao.arweave.net/welcome',
          title: 'Welcome to AO',
          category: 'introduction',
          priority: 1,
          estimatedWords: 800,
          tags: ['introduction', 'welcome'],
          description: 'Introduction to the AO ecosystem',
          siteKey: 'ao',
          siteName: 'AO Cookbook'
        },
        {
          url: 'https://cookbook_ao.arweave.net/guides/setup',
          title: 'Setting Up AO',
          category: 'guides',
          priority: 2,
          estimatedWords: 1200,
          tags: ['setup', 'installation'],
          description: 'How to set up your AO development environment',
          siteKey: 'ao',
          siteName: 'AO Cookbook'
        }
      ]
    },
    arweave: {
      siteKey: 'arweave',
      name: 'Arweave Cookbook',
      pages: [
        {
          url: 'https://cookbook.arweave.net/getting-started',
          title: 'Getting Started with Arweave',
          category: 'getting-started',
          priority: 1,
          estimatedWords: 1000,
          tags: ['getting-started', 'basics'],
          description: 'Your first steps with Arweave',
          siteKey: 'arweave',
          siteName: 'Arweave Cookbook'
        }
      ]
    }
  };
} 