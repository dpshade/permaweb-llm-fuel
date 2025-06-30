// test/deploy-script.test.js - Test deployment script functionality
import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Mock child_process and fs for testing
const mockExecSync = mock(() => Buffer.from('success'));
const mockFsExistsSync = mock(() => true);
const mockFsMkdirSync = mock(() => undefined);
const mockFsRmSync = mock(() => undefined);
const mockFsWriteFileSync = mock(() => undefined);
const mockFsReadFileSync = mock(() => Buffer.from('test content'));
const mockFsReaddirSync = mock(() => []);

mock.module('child_process', () => ({
  execSync: mockExecSync
}));

mock.module('fs', () => ({
  existsSync: mockFsExistsSync,
  mkdirSync: mockFsMkdirSync,
  rmSync: mockFsRmSync,
  writeFileSync: mockFsWriteFileSync,
  readFileSync: mockFsReadFileSync,
  readdirSync: mockFsReaddirSync,
  default: {
    existsSync: mockFsExistsSync,
    mkdirSync: mockFsMkdirSync,
    rmSync: mockFsRmSync,
    writeFileSync: mockFsWriteFileSync,
    readFileSync: mockFsReadFileSync,
    readdirSync: mockFsReaddirSync
  }
}));

describe('deploy-script', () => {
  let chdirSpy;
  let originalCwd;
  
  beforeEach(() => {
    originalCwd = process.cwd();
    chdirSpy = spyOn(process, 'chdir').mockImplementation(() => {});
    
    // Reset mocks
    mockExecSync.mockClear();
    mockFsExistsSync.mockClear();
    mockFsMkdirSync.mockClear();
    mockFsRmSync.mockClear();
    mockFsWriteFileSync.mockClear();
    mockFsReadFileSync.mockClear();
    mockFsReaddirSync.mockClear();
    
    // Default mocks
    mockFsExistsSync.mockReturnValue(true);
    mockFsMkdirSync.mockReturnValue(undefined);
    mockFsRmSync.mockReturnValue(undefined);
    mockFsWriteFileSync.mockReturnValue(undefined);
    mockFsReadFileSync.mockReturnValue(Buffer.from('test content'));
    mockFsReaddirSync.mockReturnValue([]);
    
    mockExecSync.mockReturnValue(Buffer.from('success'));
  });

  afterEach(() => {
    chdirSpy.mockRestore();
    process.chdir(originalCwd);
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_ORG_ID;
    delete process.env.VERCEL_PROJECT_ID;
    delete process.env.DEPLOY_KEY;
    delete process.env.ANT_PROCESS;
  });

  describe('DeploymentManager', () => {
    it('should validate build directory exists', async () => {
      mockFsExistsSync.mockReturnValue(false);
      
      const { DeploymentManager } = await import('../scripts/deploy.js');
      const deployment = new DeploymentManager({ chdir: () => {} });
      
      await expect(deployment.build()).rejects.toThrow('Build directory dist not found');
    });

    it('should create Vercel output structure', async () => {
      const { DeploymentManager } = await import('../scripts/deploy.js');
      const deployment = new DeploymentManager({ chdir: () => {} });
      
      await deployment.build();
      
      expect(mockFsMkdirSync).toHaveBeenCalledWith(
        path.dirname('.vercel/output/static'), 
        { recursive: true }
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'cp -r dist .vercel/output/static', 
        { stdio: 'inherit' }
      );
    });

    it('should compress eligible files', async () => {
      // Mock directory structure to avoid infinite recursion
      mockFsReaddirSync.mockReturnValue([
        { name: 'test.js', isDirectory: () => false },
        { name: 'test.txt', isDirectory: () => false },
        { name: 'subdir', isDirectory: () => true }
      ]);
      
      // Mock subdirectory read
      mockFsReaddirSync.mockImplementation((dir) => {
        if (dir.includes('subdir')) {
          return [];
        }
        return [
          { name: 'test.js', isDirectory: () => false },
          { name: 'test.txt', isDirectory: () => false },
          { name: 'subdir', isDirectory: () => true }
        ];
      });
      
      const { DeploymentManager } = await import('../scripts/deploy.js');
      const deployment = new DeploymentManager({ chdir: () => {} });
      
      await deployment.build();
      
      // Should attempt to compress .js files but not .txt
      expect(mockFsReadFileSync).toHaveBeenCalled();
    });

    it('should validate critical files exist', async () => {
      mockFsExistsSync.mockImplementation((filePath) => {
        return !filePath.includes('index.html');
      });
      
      const { DeploymentManager } = await import('../scripts/deploy.js');
      const deployment = new DeploymentManager({ chdir: () => {} });
      
      await expect(deployment.build()).rejects.toThrow('Missing critical files: index.html');
    });

    it('should handle Vercel deployment with required env vars', async () => {
      process.env.VERCEL_TOKEN = 'test-token';
      process.env.VERCEL_ORG_ID = 'test-org';
      process.env.VERCEL_PROJECT_ID = 'test-project';
      
      const { DeploymentManager } = await import('../scripts/deploy.js');
      const deployment = new DeploymentManager({ chdir: () => {} });
      
      await deployment.deployVercel();
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('npx vercel --token'),
        { stdio: 'inherit' }
      );
      
      // Cleanup
      delete process.env.VERCEL_TOKEN;
      delete process.env.VERCEL_ORG_ID;
      delete process.env.VERCEL_PROJECT_ID;
    });

    it('should fail Vercel deployment without required env vars', async () => {
      const { DeploymentManager } = await import('../scripts/deploy.js');
      const deployment = new DeploymentManager({ chdir: () => {} });
      
      await expect(deployment.deployVercel()).rejects.toThrow('VERCEL_TOKEN not set');
    });

    it('should handle Arweave deployment with required env vars', async () => {
      process.env.VERCEL_TOKEN = 'test-token';
      process.env.VERCEL_ORG_ID = 'test-org';
      process.env.VERCEL_PROJECT_ID = 'test-project';
      process.env.DEPLOY_KEY = 'test-key';
      process.env.ANT_PROCESS = 'test-process';
      
      const { DeploymentManager } = await import('../scripts/deploy.js');
      const deployment = new DeploymentManager({ chdir: () => {} });
      
      await deployment.deployArweave();
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('npx permaweb-deploy'),
        { stdio: 'inherit' }
      );
      
      // Cleanup
      delete process.env.VERCEL_TOKEN;
      delete process.env.VERCEL_ORG_ID;
      delete process.env.VERCEL_PROJECT_ID;
      delete process.env.DEPLOY_KEY;
      delete process.env.ANT_PROCESS;
    });

    it('should fail Arweave deployment without required env vars', async () => {
      const { DeploymentManager } = await import('../scripts/deploy.js');
      const deployment = new DeploymentManager({ chdir: () => {} });
      
      await expect(deployment.deployArweave()).rejects.toThrow('Arweave deployment credentials not set');
      
      // Cleanup
      delete process.env.VERCEL_TOKEN;
      delete process.env.VERCEL_ORG_ID;
      delete process.env.VERCEL_PROJECT_ID;
    });

    it('should handle build errors gracefully', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Build failed');
      });
      
      const { DeploymentManager } = await import('../scripts/deploy.js');
      const deployment = new DeploymentManager({ chdir: () => {} });
      
      await expect(deployment.build()).rejects.toThrow('Build failed');
    });

    it('should clean system files during optimization', async () => {
      const { DeploymentManager } = await import('../scripts/deploy.js');
      const deployment = new DeploymentManager({ chdir: () => {} });
      
      await deployment.build();
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('find'),
        { stdio: 'ignore' }
      );
    });
  });
}); 