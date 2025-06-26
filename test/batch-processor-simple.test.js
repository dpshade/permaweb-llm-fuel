import { expect, it, describe, beforeEach } from 'vitest';
import { 
  Semaphore,
  withRetry
} from '../src/utils/batch-processor.js';

describe('batch-processor-simple', () => {
  describe('Semaphore', () => {
    it('should control concurrency properly', async () => {
      const semaphore = new Semaphore(2);
      let activeCount = 0;
      let maxActive = 0;
      
      const tasks = Array.from({ length: 5 }, async (_, i) => {
        await semaphore.acquire();
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        
        await new Promise(resolve => setTimeout(resolve, 10));
        
        activeCount--;
        semaphore.release();
        
        return i;
      });
      
      await Promise.all(tasks);
      
      expect(maxActive).toBeLessThanOrEqual(2);
      expect(activeCount).toBe(0);
    });

    it('should handle queue properly', async () => {
      const semaphore = new Semaphore(1);
      const results = [];
      
      const task1 = async () => {
        await semaphore.acquire();
        results.push('task1-start');
        await new Promise(resolve => setTimeout(resolve, 20));
        results.push('task1-end');
        semaphore.release();
      };
      
      const task2 = async () => {
        await semaphore.acquire();
        results.push('task2-start');
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('task2-end');
        semaphore.release();
      };
      
      await Promise.all([task1(), task2()]);
      
      expect(results).toEqual(['task1-start', 'task1-end', 'task2-start', 'task2-end']);
    });
  });

  describe('withRetry', () => {
    it('should retry failed operations', async () => {
      let attemptCount = 0;
      const failingFn = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Mock failure');
        }
        return 'success';
      };
      
      const result = await withRetry(failingFn, { maxRetries: 3, baseDelay: 1 });
      
      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should respect retry conditions', async () => {
      const failingFn = async () => {
        throw new Error('Non-retryable error');
      };
      
      const retryCondition = (error) => !error.message.includes('Non-retryable');
      
      await expect(withRetry(failingFn, { retryCondition, maxRetries: 3 }))
        .rejects.toThrow('Non-retryable error');
    });

    it('should use exponential backoff', async () => {
      const startTime = Date.now();
      let attemptCount = 0;
      
      const failingFn = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Mock failure');
        }
        return 'success';
      };
      
      await withRetry(failingFn, { maxRetries: 3, baseDelay: 10 });
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThan(10); // Should have some delay from retries
    });

    it('should respect maxRetries', async () => {
      let attemptCount = 0;
      const alwaysFailingFn = async () => {
        attemptCount++;
        throw new Error('Always fails');
      };
      
      await expect(withRetry(alwaysFailingFn, { maxRetries: 2, baseDelay: 1 }))
        .rejects.toThrow('Always fails');
      
      expect(attemptCount).toBe(3); // Initial attempt + 2 retries
    });
  });
}); 