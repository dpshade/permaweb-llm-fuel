#!/usr/bin/env bun
// scripts/generate-llms-txt.js - Generate LLMs.txt files for individual websites

import fs from 'fs';
import path from 'path';
import { fetchAndClean, generateLLMsTxt, generateParsingReport } from '../src/server/utils/defuddle-fetch-server.js';

console.log('🚀 LLMs.txt generator script starting...');

const CONFIG = {
  docsIndexPath: 'public/docs-index.json',
  outputDir: 'public/llms',
  maxConcurrency: 3,
  qualityThreshold: 0.2,
  minWordCount: 30
};

class LLMsTxtGenerator {
  constructor() {
    this.stats = {
      totalSites: 0,
      processedSites: 0,
      totalPages: 0,
      successfulPages: 0,
      failedPages: 0,
      qualityFiltered: 0,
      totalWords: 0
    };
  }

  async generateAll() {
    console.log('📚 Starting LLMs.txt generation for all sites...');
    
    if (!fs.existsSync(CONFIG.docsIndexPath)) {
      throw new Error(`Docs index not found: ${CONFIG.docsIndexPath}`);
    }

    // Ensure output directory exists
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });

    const docsIndex = JSON.parse(fs.readFileSync(CONFIG.docsIndexPath, 'utf8'));
    const sites = docsIndex.sites || {};

    this.stats.totalSites = Object.keys(sites).length;
    console.log(`Found ${this.stats.totalSites} sites to process`);

    for (const [siteKey, siteData] of Object.entries(sites)) {
      await this.generateForSite(siteKey, siteData);
    }

    this.generateSummary();
  }

  async generateForSite(siteKey, siteData) {
    console.log(`\n🌐 Processing site: ${siteData.name} (${siteKey})`);
    
    const pages = siteData.pages || [];
    if (pages.length === 0) {
      console.log(`  ⚠️ No pages found for ${siteKey}`);
      return;
    }

    this.stats.totalPages += pages.length;
    console.log(`  📄 Found ${pages.length} pages`);

    // Fetch and clean all pages for this site
    const urls = pages.map(page => page.url);
    const batchResults = await this.batchFetchPages(urls, siteKey);
    
    // Generate LLMs.txt for this site
    const llmsContent = this.generateSiteLLMsTxt(siteData, batchResults);
    
    // Save the LLMs.txt file
    const outputPath = path.join(CONFIG.outputDir, `${siteKey}-llms.txt`);
    fs.writeFileSync(outputPath, llmsContent);
    
    // Save detailed report
    const reportPath = path.join(CONFIG.outputDir, `${siteKey}-report.txt`);
    const report = this.generateSiteReport(siteData, batchResults);
    fs.writeFileSync(reportPath, report);

    console.log(`  ✅ Generated: ${outputPath}`);
    console.log(`  📊 Report: ${reportPath}`);
    
    this.stats.processedSites++;
  }

  async batchFetchPages(urls, siteKey) {
    const results = [];
    const errors = [];
    const qualityFiltered = [];
    
    // Process URLs in batches to control concurrency
    const batches = [];
    for (let i = 0; i < urls.length; i += CONFIG.maxConcurrency) {
      batches.push(urls.slice(i, i + CONFIG.maxConcurrency));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(async (url) => {
        try {
          const result = await fetchAndClean(url, {
            qualityThreshold: CONFIG.qualityThreshold,
            timeout: 30000
          });
          
          this.stats.successfulPages++;
          this.stats.totalWords += result.wordCount || 0;
          
          return result;
        } catch (error) {
          if (error.message.includes('Content quality too low')) {
            this.stats.qualityFiltered++;
            qualityFiltered.push({ url, error: error.message });
          } else {
            this.stats.failedPages++;
            errors.push({ url, error: error.message });
          }
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(Boolean));
    }

    return { results, errors, qualityFiltered };
  }

  generateSiteLLMsTxt(siteData, batchResults) {
    const { results, qualityFiltered } = batchResults;
    
    if (results.length === 0) {
      return `# ${siteData.name} - No Content Available\n\nNo high-quality content could be extracted from this site.\n\nGenerated: ${new Date().toISOString()}`;
    }

    return generateLLMsTxt(results, {
      includeMetadata: true,
      includeQualityScores: true,
      sortByQuality: true,
      includeQualityDisclaimer: true
    }, qualityFiltered);
  }

  generateSiteReport(siteData, batchResults) {
    const { results, errors, qualityFiltered } = batchResults;
    
    let report = `📊 ${siteData.name} - Content Extraction Report\n`;
    report += '='.repeat(50) + '\n\n';
    
    report += `Site: ${siteData.name}\n`;
    report += `Base URL: ${siteData.baseUrl}\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;
    
    report += '📈 EXTRACTION STATISTICS\n';
    report += '-'.repeat(30) + '\n';
    report += `Total pages: ${results.length + errors.length + qualityFiltered.length}\n`;
    report += `Successful: ${results.length}\n`;
    report += `Failed: ${errors.length}\n`;
    report += `Quality filtered: ${qualityFiltered.length}\n`;
    report += `Total words: ${results.reduce((sum, doc) => sum + (doc.wordCount || 0), 0)}\n`;
    report += `Average words per page: ${results.length > 0 ? (results.reduce((sum, doc) => sum + (doc.wordCount || 0), 0) / results.length).toFixed(0) : 0}\n\n`;
    
    if (results.length > 0) {
      const avgQuality = results.reduce((sum, doc) => sum + (doc.qualityScore || 0), 0) / results.length;
      report += `Average quality score: ${avgQuality.toFixed(3)}\n\n`;
      
      // Extraction methods breakdown
      const methodCounts = {};
      results.forEach(result => {
        methodCounts[result.extractionMethod] = (methodCounts[result.extractionMethod] || 0) + 1;
      });
      
      report += '🔧 EXTRACTION METHODS\n';
      report += '-'.repeat(25) + '\n';
      Object.entries(methodCounts).forEach(([method, count]) => {
        const percentage = ((count / results.length) * 100).toFixed(1);
        report += `${method}: ${count} (${percentage}%)\n`;
      });
      report += '\n';
    }
    
    if (errors.length > 0) {
      report += '❌ ERRORS\n';
      report += '-'.repeat(15) + '\n';
      errors.slice(0, 10).forEach(error => {
        report += `- ${error.url}: ${error.error}\n`;
      });
      if (errors.length > 10) {
        report += `... and ${errors.length - 10} more errors\n`;
      }
      report += '\n';
    }
    
    return report;
  }

  generateSummary() {
    console.log('\n📊 GENERATION SUMMARY');
    console.log('='.repeat(30));
    console.log(`Sites processed: ${this.stats.processedSites}/${this.stats.totalSites}`);
    console.log(`Total pages: ${this.stats.totalPages}`);
    console.log(`Successful extractions: ${this.stats.successfulPages}`);
    console.log(`Failed extractions: ${this.stats.failedPages}`);
    console.log(`Quality filtered: ${this.stats.qualityFiltered}`);
    console.log(`Total words extracted: ${this.stats.totalWords.toLocaleString()}`);
    
    const successRate = this.stats.totalPages > 0 
      ? ((this.stats.successfulPages / this.stats.totalPages) * 100).toFixed(1)
      : 0;
    console.log(`Success rate: ${successRate}%`);
  }
}

// Main execution
if (process.argv[1] && process.argv[1].endsWith('generate-llms-txt.js')) {
  console.log('📝 Script executed directly, starting generation...');
  const generator = new LLMsTxtGenerator();
  
  (async () => {
    try {
      await generator.generateAll();
      console.log('\n✅ LLMs.txt generation completed successfully!');
    } catch (error) {
      console.error(`❌ Generation failed: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    }
  })();
} else {
  console.log('📝 Script imported as module');
}

export { LLMsTxtGenerator }; 