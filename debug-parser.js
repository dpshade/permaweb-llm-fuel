#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';

// Test the parsing logic from the generate-llms-txt.js file
function parseLLMsContent(content, siteKey) {
  const documents = [];
  const qualityFiltered = [];
  
  // Split content into sections
  const sections = content.split(/\n---\n/);
  
  console.log(`📄 Parsing ${sections.length} sections for ${siteKey}`);
  
  // Skip header and TOC sections
  const documentSections = sections.slice(2); // Skip header and TOC
  
  console.log(`📄 Found ${documentSections.length} document sections`);
  
  for (const section of documentSections) {
    if (!section.trim()) continue;
    
    // Parse document metadata and content
    const lines = section.split('\n');
    
    // Find the first non-empty line that matches document title pattern
    let titleLine = null;
    let titleLineIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && line.match(/^# \d+\. (.+)$/)) {
        titleLine = line;
        titleLineIndex = i;
        break;
      }
    }
    
    if (!titleLine) {
      console.log(`    ⚠️ No title match for section: ${lines[0]?.substring(0, 50)}...`);
      continue;
    }
    
    const titleMatch = titleLine.match(/^# \d+\. (.+)$/);
    const title = titleMatch[1];
    const metadata = {};
    let contentStart = 0;
    
    // Parse metadata lines (start after title line)
    for (let i = titleLineIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        contentStart = i + 1;
        break;
      }
      
      const match = line.match(/^([^:]+): (.+)$/);
      if (match) {
        const [, key, value] = match;
        metadata[key.trim()] = value.trim();
      }
    }
    
    // Extract content
    const content = lines.slice(contentStart).join('\n').trim();
    
    if (metadata.Source && content) {
      documents.push({
        title,
        url: metadata.Source,
        wordCount: parseInt(metadata.Words) || 0,
        qualityScore: parseFloat(metadata['Quality Score']) || 0,
        extractionMethod: metadata['Extraction Method'] || 'unknown',
        extractionReason: metadata['Extraction Reason'] || 'unknown',
        content,
        siteKey
      });
      console.log(`    ✅ Parsed document: ${title}`);
    } else {
      console.log(`    ⚠️ Missing source or content for: ${title}`);
      console.log(`       Source: ${metadata.Source}`);
      console.log(`       Content length: ${content.length}`);
    }
  }
  
  return { documents, qualityFiltered };
}

// Test with arweave-llms.txt
const filePath = 'public/llms/arweave-llms.txt';
const content = fs.readFileSync(filePath, 'utf8');

console.log('🔍 Testing parser with arweave-llms.txt...');
const result = parseLLMsContent(content, 'arweave');

console.log(`\n📊 Results:`);
console.log(`Documents found: ${result.documents.length}`);
console.log(`Quality filtered: ${result.qualityFiltered.length}`);

if (result.documents.length > 0) {
  console.log(`\nFirst document:`);
  console.log(`Title: ${result.documents[0].title}`);
  console.log(`URL: ${result.documents[0].url}`);
  console.log(`Words: ${result.documents[0].wordCount}`);
  console.log(`Quality: ${result.documents[0].qualityScore}`);
} 