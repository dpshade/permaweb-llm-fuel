/**
 * Test suite for AccordionManager
 * Validates systematic diagnostic and resolution approach
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AccordionManager, diagnoseAccordionIssues, fixAccordionInIframe } from '../src/utils/accordion-manager.js';

// Mock DOM environment
const mockDOM = () => {
  // Create mock elements
  const accordion = document.createElement('div');
  accordion.setAttribute('data-accordion', 'test-accordion');
  accordion.id = 'test-accordion';
  
  const children = document.createElement('div');
  children.id = 'test-accordion-children';
  children.className = 'site-children';
  
  const toggle = document.createElement('svg');
  toggle.id = 'toggle-test-accordion';
  toggle.className = 'tree-toggle';
  
  const container = document.createElement('div');
  container.className = 'container';
  container.appendChild(accordion);
  accordion.appendChild(children);
  accordion.appendChild(toggle);
  
  document.body.appendChild(container);
  
  return { accordion, children, toggle, container };
};

describe('AccordionManager', () => {
  let manager;
  let mockElements;
  
  beforeEach(() => {
    // Mock window.self and window.top
    Object.defineProperty(window, 'self', { value: window });
    Object.defineProperty(window, 'top', { value: window });
    
    // Mock ResizeObserver
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn()
    }));
    
    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: query.includes('reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    
    mockElements = mockDOM();
    manager = new AccordionManager();
  });
  
  afterEach(() => {
    document.body.innerHTML = '';
    if (manager) {
      manager.destroy();
    }
  });

  describe('Step 1: Layout Context Diagnostics', () => {
    it('should diagnose layout context correctly', () => {
      const result = manager.diagnoseLayoutContext();
      
      expect(result).toBeDefined();
      expect(result.isIframe).toBe(false);
      expect(result.accordionPosition).toBeDefined();
      expect(result.containerOverflow).toBeDefined();
      expect(result.containerHeight).toBeGreaterThan(0);
      expect(result.accordionHeight).toBeGreaterThan(0);
    });

    it('should detect iframe mode correctly', () => {
      // Mock iframe environment
      Object.defineProperty(window, 'top', { value: {} });
      
      const iframeManager = new AccordionManager();
      const result = iframeManager.diagnoseLayoutContext();
      
      expect(result.isIframe).toBe(true);
    });
  });

  describe('Step 2: Measurement Timing Diagnostics', () => {
    it('should check measurement timing', () => {
      const result = manager.checkMeasurementTiming();
      
      expect(result).toBeDefined();
      expect(result.immediateHeight).toBeGreaterThan(0);
      expect(typeof result.nextFrameHeight).toBe('number');
      expect(typeof result.afterLoadHeight).toBe('number');
    });
  });

  describe('Step 3: Stacking Context Diagnostics', () => {
    it('should identify stacking contexts', () => {
      const result = manager.checkStackingContext();
      
      expect(Array.isArray(result)).toBe(true);
      // Should find at least the body element
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle elements with z-index and position', () => {
      // Add an element with z-index
      const element = document.createElement('div');
      element.style.zIndex = '10';
      element.style.position = 'relative';
      document.body.appendChild(element);
      
      const result = manager.checkStackingContext();
      
      expect(result.some(ctx => ctx.zIndex === '10')).toBe(true);
    });
  });

  describe('Step 4: Animation Behavior Diagnostics', () => {
    it('should check animation support', () => {
      const result = manager.checkAnimationBehavior();
      
      expect(result).toBeDefined();
      expect(typeof result.transitionSupport).toBe('boolean');
      expect(typeof result.willChangeSupport).toBe('boolean');
      expect(typeof result.reducedMotion).toBe('boolean');
    });
  });

  describe('Comprehensive Diagnostics', () => {
    it('should run complete diagnostics', () => {
      const result = manager.runDiagnostics();
      
      expect(result).toBeDefined();
      expect(result.layoutContext).toBeDefined();
      expect(result.measurementTiming).toBeDefined();
      expect(result.stackingContext).toBeDefined();
      expect(result.animationBehavior).toBeDefined();
    });
  });

  describe('Accordion Toggle Functionality', () => {
    it('should toggle accordion correctly', () => {
      const accordionId = 'test-accordion';
      
      // Initially collapsed
      expect(mockElements.children.classList.contains('expanded')).toBe(false);
      
      // Toggle to expand
      manager.toggleAccordion(accordionId);
      expect(mockElements.children.classList.contains('expanded')).toBe(true);
      expect(mockElements.toggle.style.transform).toBe('rotate(90deg)');
      
      // Toggle to collapse
      manager.toggleAccordion(accordionId);
      expect(mockElements.children.classList.contains('expanded')).toBe(false);
      expect(mockElements.toggle.style.transform).toBe('rotate(0deg)');
    });

    it('should implement accordion-style behavior (only one open)', () => {
      // Create second accordion
      const accordion2 = document.createElement('div');
      accordion2.id = 'test-accordion-2';
      const children2 = document.createElement('div');
      children2.id = 'test-accordion-2-children';
      children2.className = 'site-children';
      const toggle2 = document.createElement('svg');
      toggle2.id = 'toggle-test-accordion-2';
      accordion2.appendChild(children2);
      accordion2.appendChild(toggle2);
      document.body.appendChild(accordion2);
      
      // Expand first accordion
      manager.toggleAccordion('test-accordion');
      expect(mockElements.children.classList.contains('expanded')).toBe(true);
      
      // Expand second accordion - should collapse first
      manager.toggleAccordion('test-accordion-2');
      expect(mockElements.children.classList.contains('expanded')).toBe(false);
      expect(children2.classList.contains('expanded')).toBe(true);
    });
  });

  describe('Iframe Mode Fixes', () => {
    beforeEach(() => {
      // Mock iframe environment
      Object.defineProperty(window, 'top', { value: {} });
      manager = new AccordionManager({ iframeMode: true });
    });

    it('should apply iframe-specific fixes', () => {
      expect(document.body.classList.contains('iframe-embed')).toBe(true);
    });

    it('should recalculate heights in iframe mode', () => {
      const recalculateSpy = vi.spyOn(manager, 'recalculateAccordionHeights');
      
      // Trigger resize observer
      const resizeObserver = global.ResizeObserver.mock.results[0].value;
      resizeObserver.observe.mock.calls[0][0].dispatchEvent(new Event('resize'));
      
      expect(recalculateSpy).toHaveBeenCalled();
    });
  });

  describe('Event Handling', () => {
    it('should handle site checkbox changes', () => {
      // Mock global functions
      window.selectedPages = new Set();
      window.updateSelectionCount = vi.fn();
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'site-checkbox';
      checkbox.dataset.site = 'test-site';
      checkbox.checked = true;
      
      // Create page checkboxes
      const pageCheckbox = document.createElement('input');
      pageCheckbox.type = 'checkbox';
      pageCheckbox.className = 'page-checkbox';
      pageCheckbox.dataset.site = 'test-site';
      pageCheckbox.dataset.url = 'http://example.com';
      document.body.appendChild(pageCheckbox);
      
      manager.handleSiteCheckboxChange(checkbox);
      
      expect(window.selectedPages.has('http://example.com')).toBe(true);
      expect(window.updateSelectionCount).toHaveBeenCalled();
    });

    it('should handle page checkbox changes', () => {
      // Mock global functions
      window.selectedPages = new Set();
      window.updateSelectionCount = vi.fn();
      window.updateSiteCheckboxes = vi.fn();
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'page-checkbox';
      checkbox.dataset.url = 'http://example.com';
      checkbox.checked = true;
      
      manager.handlePageCheckboxChange(checkbox);
      
      expect(window.selectedPages.has('http://example.com')).toBe(true);
      expect(window.updateSelectionCount).toHaveBeenCalled();
      expect(window.updateSiteCheckboxes).toHaveBeenCalled();
    });
  });

  describe('Utility Functions', () => {
    it('should provide diagnostic utility function', () => {
      const result = diagnoseAccordionIssues();
      
      expect(result).toBeDefined();
      expect(result.layoutContext).toBeDefined();
    });

    it('should provide iframe fix utility function', () => {
      const iframeManager = fixAccordionInIframe();
      
      expect(iframeManager).toBeInstanceOf(AccordionManager);
      expect(iframeManager.config.iframeMode).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources properly', () => {
      const disconnectSpy = vi.spyOn(manager.resizeObserver, 'disconnect');
      
      manager.destroy();
      
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });
});

describe('Integration Tests', () => {
  it('should work with existing DOM structure', () => {
    // Create a more realistic DOM structure
    const container = document.createElement('div');
    container.className = 'main-container';
    
    const tree = document.createElement('div');
    tree.id = 'docs-tree';
    
    const siteHeader = document.createElement('div');
    siteHeader.className = 'tree-site-header';
    
    const siteCheckbox = document.createElement('input');
    siteCheckbox.type = 'checkbox';
    siteCheckbox.className = 'site-checkbox';
    siteCheckbox.dataset.site = 'test-site';
    
    const siteContent = document.createElement('div');
    siteContent.className = 'tree-site-content';
    
    const children = document.createElement('div');
    children.id = 'site-test-site-children';
    children.className = 'site-children';
    
    const toggle = document.createElement('svg');
    toggle.id = 'toggle-site-test-site';
    
    siteHeader.appendChild(siteCheckbox);
    siteHeader.appendChild(siteContent);
    siteHeader.appendChild(toggle);
    tree.appendChild(siteHeader);
    tree.appendChild(children);
    container.appendChild(tree);
    document.body.appendChild(container);
    
    const manager = new AccordionManager();
    
    // Test that it can find and work with the structure
    const result = manager.diagnoseLayoutContext();
    expect(result).toBeDefined();
    
    manager.destroy();
  });
}); 