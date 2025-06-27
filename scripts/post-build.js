#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';
import { execSync } from 'child_process';

console.log('🔧 Running post-build optimizations...');

const DIST_DIR = 'dist';
const VERCEL_DIR = '.vercel/output/static';

// Determine which directory to process
const buildDir = fs.existsSync(VERCEL_DIR) ? VERCEL_DIR : DIST_DIR;

if (!fs.existsSync(buildDir)) {
  console.error(`❌ Build directory ${buildDir} not found`);
  process.exit(1);
}

console.log(`📁 Processing build directory: ${buildDir}`);

// Run crawler in CI/Vercel environment to generate docs index
const isCI = process.env.CI === 'true' || 
             process.env.VERCEL === '1' || 
             process.env.GITHUB_ACTIONS === 'true' ||
             process.env.VERCEL_BUILD === 'true';

if (isCI) {
  console.log('🕷️  Running crawler to generate docs index...');
  try {
    // Run crawler with production settings
    execSync('NODE_ENV=production bun run src/utils/crawler.js', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('   ✓ Docs index generated successfully');
    
    // Copy docs index to build directory if it was generated in project root
    const tempIndexPath = path.join(process.cwd(), 'temp-docs-index.json');
    const publicIndexPath = path.join(process.cwd(), 'public/docs-index.json');
    const buildIndexPath = path.join(buildDir, 'docs-index.json');
    
    // Try to copy from temp location first, then public
    let indexCopied = false;
    for (const sourcePath of [publicIndexPath, tempIndexPath]) {
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, buildIndexPath);
        console.log(`   ✓ Copied docs index to build directory from ${path.basename(sourcePath)}`);
        indexCopied = true;
        break;
      }
    }
    
    if (!indexCopied) {
      console.warn('   ⚠️  No docs index found to copy to build directory');
    }
    
  } catch (error) {
    console.error('   ❌ Failed to run crawler:', error.message);
    // Don't fail the build if crawler fails - the site should still deploy
    console.warn('   ⚠️  Continuing build without updated docs index');
  }
} else {
  console.log('📝 Skipping crawler (not in CI environment)');
}

// Clean up system files
try {
  execSync(`find ${buildDir} -name ".DS_Store" -delete`, { stdio: 'ignore' });
  console.log('   ✓ Cleaned system files');
} catch (error) {
  // Ignore if no files found
}

// Add .nojekyll for GitHub Pages compatibility
try {
  fs.writeFileSync(path.join(buildDir, '.nojekyll'), '');
  console.log('   ✓ Added .nojekyll file');
} catch (error) {
  console.warn('   ⚠️  Could not create .nojekyll file');
}

// Compress assets function
function compressAssets(directory) {
  const stats = {
    totalOriginal: 0,
    totalCompressed: 0,
    filesProcessed: 0
  };

  function processDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        processDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const shouldCompress = ['.js', '.css', '.html', '.json', '.txt', '.svg', '.xml'].includes(ext);
        
        if (shouldCompress && fs.existsSync(fullPath)) {
          try {
            const originalSize = fs.statSync(fullPath).size;
            const content = fs.readFileSync(fullPath);
            const compressed = gzipSync(content, { level: 9 });
            
            // Only create .gz if compression is beneficial
            if (compressed.length < originalSize * 0.9) {
              fs.writeFileSync(`${fullPath}.gz`, compressed);
              
              stats.totalOriginal += originalSize;
              stats.totalCompressed += compressed.length;
              stats.filesProcessed++;
              
              const reduction = ((originalSize - compressed.length) / originalSize * 100).toFixed(1);
              const relativePath = path.relative(buildDir, fullPath);
              console.log(`   ✓ Compressed ${relativePath}: ${formatBytes(originalSize)} → ${formatBytes(compressed.length)} (${reduction}% reduction)`);
            }
          } catch (error) {
            const relativePath = path.relative(buildDir, fullPath);
            console.warn(`   ⚠️  Could not compress ${relativePath}: ${error.message}`);
          }
        }
      }
    }
  }

  processDirectory(directory);
  return stats;
}

// Analyze build output
function analyzeBuild(directory) {
  let totalSize = 0;
  let fileCount = 0;
  
  function analyzeDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        analyzeDirectory(fullPath);
      } else if (entry.isFile() && !entry.name.endsWith('.gz')) {
        const stats = fs.statSync(fullPath);
        totalSize += stats.size;
        fileCount++;
      }
    }
  }
  
  analyzeDirectory(directory);
  return { totalSize, fileCount };
}

// Run optimizations
const buildStats = analyzeBuild(buildDir);
console.log(`📊 Build analysis: ${buildStats.fileCount} files, ${formatBytes(buildStats.totalSize)} total`);

const compressionStats = compressAssets(buildDir);

if (compressionStats.filesProcessed > 0) {
  const totalReduction = ((compressionStats.totalOriginal - compressionStats.totalCompressed) / compressionStats.totalOriginal * 100).toFixed(1);
  console.log(`📈 Compression summary: ${compressionStats.filesProcessed} files compressed, ${totalReduction}% total reduction`);
}

// Validate critical files exist
const criticalFiles = ['index.html'];
const missingFiles = criticalFiles.filter(file => !fs.existsSync(path.join(buildDir, file)));

if (missingFiles.length > 0) {
  console.error(`❌ Missing critical files: ${missingFiles.join(', ')}`);
  process.exit(1);
}

console.log('✅ Post-build optimizations complete!');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
} 