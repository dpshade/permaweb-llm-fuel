#!/usr/bin/env bun
// scripts/deploy.js - Unified deployment script

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { gzipSync } from 'zlib';

const CONFIG = {
  buildDir: 'dist',
  vercelOutputDir: '.vercel/output/static',
  compressibleExts: ['.js', '.css', '.html', '.json', '.svg', '.xml'],
  compressionThreshold: 0.9
};

class DeploymentManager {
  constructor({ chdir = process.chdir } = {}) {
    this.stats = { compressed: 0, totalReduction: 0 };
    this._chdir = chdir;
  }

  async build() {
    console.log('🔨 Building project...');
    execSync('bun run build', { stdio: 'inherit' });
    
    if (!fs.existsSync(CONFIG.buildDir)) {
      throw new Error(`Build directory ${CONFIG.buildDir} not found`);
    }
    
    this.setupVercelOutput();
    this.optimize();
    this.validate();
  }

  setupVercelOutput() {
    console.log('📁 Setting up Vercel output structure...');
    
    fs.mkdirSync(path.dirname(CONFIG.vercelOutputDir), { recursive: true });
    
    if (fs.existsSync(CONFIG.vercelOutputDir)) {
      fs.rmSync(CONFIG.vercelOutputDir, { recursive: true });
    }
    
    execSync(`cp -r ${CONFIG.buildDir} ${CONFIG.vercelOutputDir}`, { stdio: 'inherit' });
  }

  optimize() {
    console.log('⚡ Optimizing build...');
    
    [CONFIG.buildDir, CONFIG.vercelOutputDir].forEach(dir => {
      try {
        execSync(`find ${dir} -name ".DS_Store" -delete`, { stdio: 'ignore' });
      } catch {}
    });
    
    fs.writeFileSync(path.join(CONFIG.vercelOutputDir, '.nojekyll'), '');
    
    this.compressAssets(CONFIG.vercelOutputDir);
    
    console.log(`✅ Optimized: ${this.stats.compressed} files compressed`);
  }

  compressAssets(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively process subdirectories
          this.compressAssets(fullPath);
        } else if (this.shouldCompress(entry.name)) {
          this.compressFile(fullPath);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error reading directory ${dir}: ${error.message}`);
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
      !fs.existsSync(path.join(CONFIG.vercelOutputDir, file))
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
    
    this._chdir(CONFIG.vercelOutputDir);
    execSync(`npx vercel --token "${process.env.VERCEL_TOKEN}" --scope "${process.env.VERCEL_ORG_ID}" --yes --prod`, 
      { stdio: 'inherit' });
    this._chdir('../../..');
  }

  async deployArweave() {
    if (!process.env.DEPLOY_KEY || !process.env.ANT_PROCESS) {
      throw new Error('Arweave deployment credentials not set');
    }
    await this.deployVercel();

    console.log('🚀 Deploying to Arweave...');
    
    execSync(`npx permaweb-deploy --ant-process="${process.env.ANT_PROCESS}" --arns-name="permaweb-llms-builder" --deploy-folder="${CONFIG.vercelOutputDir}" --verbose`, 
      { stdio: 'inherit' });
  }
}

// Export for testing
export { DeploymentManager };

// Main execution - only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
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
} 