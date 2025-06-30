#!/usr/bin/env bun
// scripts/deploy.js - Unified deployment script

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { gzipSync } from 'zlib';

const CONFIG = {
  buildDir: '.vercel/output/static',
  compressibleExts: ['.js', '.css', '.html', '.json', '.svg', '.xml'],
  compressionThreshold: 0.9
};

class DeploymentManager {
  constructor() {
    this.stats = { compressed: 0, totalReduction: 0 };
  }

  async build() {
    console.log('🔨 Building project...');
    execSync('bun run build', { stdio: 'inherit' });
    
    if (!fs.existsSync(CONFIG.buildDir)) {
      throw new Error(`Build directory ${CONFIG.buildDir} not found`);
    }
    
    this.optimize();
    this.validate();
  }

  optimize() {
    console.log('⚡ Optimizing build...');
    
    // Clean system files
    try {
      execSync(`find ${CONFIG.buildDir} -name ".DS_Store" -delete`, { stdio: 'ignore' });
    } catch {}
    
    // Add .nojekyll
    fs.writeFileSync(path.join(CONFIG.buildDir, '.nojekyll'), '');
    
    // Compress assets
    this.compressAssets(CONFIG.buildDir);
    
    console.log(`✅ Optimized: ${this.stats.compressed} files compressed`);
  }

  compressAssets(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        this.compressAssets(fullPath);
      } else if (this.shouldCompress(entry.name)) {
        this.compressFile(fullPath);
      }
    }
  }

  shouldCompress(filename) {
    const ext = path.extname(filename).toLowerCase();
    return CONFIG.compressibleExts.includes(ext);
  }

  compressFile(filePath) {
    try {
      const content = fs.readFileSync(filePath);
      const compressed = gzipSync(content, { level: 9 });
      
      if (compressed.length < content.length * CONFIG.compressionThreshold) {
        fs.writeFileSync(`${filePath}.gz`, compressed);
        this.stats.compressed++;
      }
    } catch (error) {
      console.warn(`⚠️ Compression failed for ${path.basename(filePath)}`);
    }
  }

  validate() {
    const criticalFiles = ['index.html'];
    const missing = criticalFiles.filter(file => 
      !fs.existsSync(path.join(CONFIG.buildDir, file))
    );
    
    if (missing.length > 0) {
      throw new Error(`Missing critical files: ${missing.join(', ')}`);
    }
  }

  async deployVercel() {
    console.log('🌐 Deploying to Vercel...');
    
    const requiredEnvs = ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'];
    for (const env of requiredEnvs) {
      if (!process.env[env]) throw new Error(`${env} not set`);
    }
    
    process.chdir(CONFIG.buildDir);
    execSync(`npx vercel --token "${process.env.VERCEL_TOKEN}" --scope "${process.env.VERCEL_ORG_ID}" --yes --prod`, 
      { stdio: 'inherit' });
    process.chdir('..');
  }

  async deployArweave() {
    await this.deployVercel();

    console.log('🚀 Deploying to Arweave...');
    
    if (!process.env.DEPLOY_KEY || !process.env.ANT_PROCESS) {
      throw new Error('Arweave deployment credentials not set');
    }
    

    execSync(`npx permaweb-deploy --ant-process="${process.env.ANT_PROCESS}" --arns-name="permaweb-llms-builder" --deploy-folder="${CONFIG.buildDir}" --verbose`, 
      { stdio: 'inherit' });
  }
}

// Main execution
const deployment = new DeploymentManager();
const target = process.argv[2] || 'build';

(async () => {
  try {
    switch (target) {
      case 'build':
        await deployment.build();
        break;
      case 'vercel':
        await deployment.build();
        await deployment.deployVercel();
        break;
      case 'arweave':
        await deployment.build();
        await deployment.deployArweave();
        break;
      case 'all':
        await deployment.build();
        await deployment.deployVercel();
        await deployment.deployArweave();
        break;
      default:
        console.error('Usage: bun deploy.js [build|vercel|arweave|all]');
        process.exit(1);
    }
    
    console.log('✅ Deployment completed successfully!');
  } catch (error) {
    console.error(`❌ Deployment failed: ${error.message}`);
    process.exit(1);
  }
})(); 