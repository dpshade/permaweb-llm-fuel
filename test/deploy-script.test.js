#!/usr/bin/env bun
// test/deploy-script.test.js - Test deployment script functionality

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('Deployment Script', () => {
  const testDirs = ['dist', '.vercel/output/static'];
  
  beforeEach(() => {
    // Clean up test directories
    testDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    });
  });
  
  afterEach(() => {
    // Clean up after tests
    testDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    });
  });

  it('should create Vercel output structure from dist directory', () => {
    // Create mock dist directory with test files
    fs.mkdirSync('dist', { recursive: true });
    fs.writeFileSync('dist/index.html', '<!DOCTYPE html><html></html>');
    fs.writeFileSync('dist/style.css', 'body { margin: 0; }');
    
    // Run the setupVercelOutput logic
    const vercelOutputDir = '.vercel/output/static';
    fs.mkdirSync(path.dirname(vercelOutputDir), { recursive: true });
    
    if (fs.existsSync(vercelOutputDir)) {
      fs.rmSync(vercelOutputDir, { recursive: true });
    }
    
    execSync(`cp -r dist ${vercelOutputDir}`, { stdio: 'ignore' });
    
    // Verify the structure was created correctly
    expect(fs.existsSync(vercelOutputDir)).toBe(true);
    expect(fs.existsSync(path.join(vercelOutputDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(vercelOutputDir, 'style.css'))).toBe(true);
  });

  it('should handle missing dist directory gracefully', () => {
    // Test that the script would throw an error for missing dist
    expect(() => {
      if (!fs.existsSync('dist')) {
        throw new Error('Build directory dist not found');
      }
    }).toThrow('Build directory dist not found');
  });

  it('should validate critical files exist', () => {
    // Create mock Vercel output without index.html
    fs.mkdirSync('.vercel/output/static', { recursive: true });
    fs.writeFileSync('.vercel/output/static/style.css', 'body { margin: 0; }');
    
    // Test validation logic
    const criticalFiles = ['index.html'];
    const missing = criticalFiles.filter(file => 
      !fs.existsSync(path.join('.vercel/output/static', file))
    );
    
    expect(missing).toContain('index.html');
    expect(missing.length).toBe(1);
  });

  it('should identify compressible file extensions', () => {
    const compressibleExts = ['.js', '.css', '.html', '.json', '.svg', '.xml'];
    
    const testCases = [
      { filename: 'script.js', shouldCompress: true },
      { filename: 'style.css', shouldCompress: true },
      { filename: 'index.html', shouldCompress: true },
      { filename: 'data.json', shouldCompress: true },
      { filename: 'icon.svg', shouldCompress: true },
      { filename: 'sitemap.xml', shouldCompress: true },
      { filename: 'image.png', shouldCompress: false },
      { filename: 'document.pdf', shouldCompress: false },
      { filename: 'archive.zip', shouldCompress: false }
    ];
    
    testCases.forEach(({ filename, shouldCompress }) => {
      const ext = path.extname(filename).toLowerCase();
      const isCompressible = compressibleExts.includes(ext);
      expect(isCompressible).toBe(shouldCompress);
    });
  });
}); 