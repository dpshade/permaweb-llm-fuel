/**
 * Enhanced Accordion Manager for Iframe Contexts
 * Provides iframe-specific diagnostics and optimizations without replacing existing functionality
 */

/**
 * @typedef {Object} AccordionConfig
 * @property {number} [maxHeight=300] - Maximum height for accordion content
 * @property {number} [transitionDuration=0.25] - Transition duration in seconds
 * @property {boolean} [iframeMode=false] - Whether to enable iframe-specific fixes
 * @property {boolean} [containerQuery=false] - Whether to use container queries
 */

/**
 * @typedef {Object} DiagnosticResult
 * @property {Object} layoutContext - Layout context diagnostic information
 * @property {string} layoutContext.accordionPosition - Position of accordion element
 * @property {string} layoutContext.containerOverflow - Overflow setting of container
 * @property {number} layoutContext.containerHeight - Height of container
 * @property {number} layoutContext.accordionHeight - Height of accordion
 * @property {boolean} layoutContext.isIframe - Whether running in iframe
 * @property {Object} measurementTiming - Measurement timing information
 * @property {number} measurementTiming.immediateHeight - Immediate height measurement
 * @property {number} measurementTiming.nextFrameHeight - Height after next frame
 * @property {number} measurementTiming.afterLoadHeight - Height after load
 * @property {Array<Object>} stackingContext - Stacking context information
 * @property {Object} animationBehavior - Animation behavior information
 */

class AccordionManager {
  /**
   * @param {AccordionConfig} config - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      maxHeight: 300,
      transitionDuration: 0.25,
      iframeMode: false,
      containerQuery: false,
      ...config
    };
    
    this.isIframe = typeof window !== 'undefined' && window.self !== window.top;
    this.resizeObserver = null;
    this.diagnostics = null;
    this.originalToggleNode = null;
    this.originalToggleSelectionDetails = null;
    
    this.init();
  }

  /**
   * Step 1: Isolate the Layout Context Problem
   * @returns {Object|null} Layout context diagnostic information
   */
  diagnoseLayoutContext() {
    const accordion = document.querySelector('.site-children, .selection-details');
    if (!accordion) return null;
    
    const container = accordion.closest('.container, .main-content, .docs-tree') || document.body;
    
    return {
      accordionPosition: getComputedStyle(accordion).position,
      containerOverflow: getComputedStyle(container).overflow,
      containerHeight: container.getBoundingClientRect().height,
      accordionHeight: accordion.getBoundingClientRect().height,
      isIframe: this.isIframe
    };
  }

  /**
   * Step 2: Fix Measurement Timing Issues
   * @returns {Object|null} Measurement timing information
   */
  checkMeasurementTiming() {
    const accordion = document.querySelector('.site-children, .selection-details');
    if (!accordion) return null;
    
    const result = {
      immediateHeight: accordion.offsetHeight,
      nextFrameHeight: 0,
      afterLoadHeight: 0
    };
    
    // Test after next frame
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        result.nextFrameHeight = accordion.offsetHeight;
      });
    }
    
    // Test after iframe load
    if (this.isIframe && typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        result.afterLoadHeight = accordion.offsetHeight;
      });
    }
    
    return result;
  }

  /**
   * Step 3: Resolve Stacking Context Conflicts
   * @returns {Array<Object>} Stacking context information
   */
  checkStackingContext() {
    const accordion = document.querySelector('.site-children, .selection-details');
    if (!accordion) return [];
    
    const stackingContexts = [];
    let element = accordion;
    
    while (element && element !== document.body) {
      const style = getComputedStyle(element);
      if (style.zIndex !== 'auto' || style.position !== 'static') {
        stackingContexts.push({
          element: element.className || element.tagName.toLowerCase(),
          zIndex: style.zIndex,
          position: style.position
        });
      }
      element = element.parentElement;
    }
    
    return stackingContexts;
  }

  /**
   * Step 4: Fix Animation/Transition Issues
   * @returns {Object|null} Animation behavior information
   */
  checkAnimationBehavior() {
    const accordion = document.querySelector('.site-children, .selection-details');
    if (!accordion) return null;
    
    return {
      transitionSupport: 'transition' in document.documentElement.style,
      willChangeSupport: 'willChange' in document.documentElement.style,
      reducedMotion: window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
    };
  }

  /**
   * Comprehensive diagnostic function
   * @returns {DiagnosticResult} Complete diagnostic results
   */
  runDiagnostics() {
    console.log('🔍 Running accordion diagnostics...');
    
    this.diagnostics = {
      layoutContext: this.diagnoseLayoutContext(),
      measurementTiming: this.checkMeasurementTiming(),
      stackingContext: this.checkStackingContext(),
      animationBehavior: this.checkAnimationBehavior()
    };
    
    console.log('📊 Diagnostic results:', this.diagnostics);
    return this.diagnostics;
  }

  /**
   * Step 1: Fix Layout Context Issues
   */
  fixLayoutContext() {
    if (!this.isIframe) return;
    
    // Ensure container establishes proper containing block
    const style = document.createElement('style');
    style.textContent = `
      .iframe-embed .main-container {
        max-height: 100vh;
        overflow: hidden;
      }
      
      .iframe-embed .main-content {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      
      .iframe-embed .docs-tree {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        position: relative;
      }
      
      .iframe-embed .site-children,
      .iframe-embed .selection-details {
        position: relative;
        z-index: 10;
      }
      
      .iframe-embed .bottom-controls {
        flex-shrink: 0;
        position: relative;
        z-index: 20;
        background: var(--bg-color);
        border-top: 1px solid var(--border-color);
        margin-top: 0;
        padding-top: 16px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Step 2: Fix Measurement Timing Issues
   */
  ensureProperMeasurement() {
    if (!this.isIframe) return;
    
    // Wait for iframe to be fully rendered
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.recalculateAccordionHeights();
      });
      this.resizeObserver.observe(document.body);
    }
    
    // Also recalculate on load
    if (typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        this.recalculateAccordionHeights();
      });
    }
  }

  recalculateAccordionHeights() {
    const accordions = document.querySelectorAll('.site-children, .selection-details');
    const mainContainer = document.querySelector('.main-container');
    const docsTree = document.querySelector('.docs-tree');
    const bottomControls = document.querySelector('.bottom-controls');
    
    if (!mainContainer || !docsTree) return;
    
    // Calculate available space more conservatively
    const containerHeight = mainContainer.clientHeight;
    const bottomControlsHeight = bottomControls ? bottomControls.offsetHeight : 0;
    const headerHeight = document.querySelector('h1') ? document.querySelector('h1').offsetHeight : 0;
    const docsTreePadding = 40; // Account for padding and margins
    
    // Calculate maximum available height for accordion content
    const maxAvailableHeight = containerHeight - bottomControlsHeight - headerHeight - docsTreePadding;
    const conservativeMaxHeight = Math.min(this.config.maxHeight, maxAvailableHeight * 0.4); // Use only 40% of available space
    
    accordions.forEach(accordion => {
      // Set a more conservative max-height
      accordion.style.setProperty('--accordion-max-height', `${conservativeMaxHeight}px`);
      
      // Also update the CSS max-height directly for immediate effect
      if (accordion.classList.contains('expanded')) {
        accordion.style.maxHeight = `${conservativeMaxHeight}px`;
      }
    });
    
    console.log('📏 Recalculated accordion heights:', {
      containerHeight,
      bottomControlsHeight,
      headerHeight,
      maxAvailableHeight,
      conservativeMaxHeight
    });
  }

  /**
   * Step 3: Fix Stacking Context Issues
   */
  fixStackingContext() {
    if (!this.isIframe) return;
    
    const style = document.createElement('style');
    style.textContent = `
      .iframe-embed {
        position: relative;
        z-index: 1;
      }
      
      .iframe-embed .site-children,
      .iframe-embed .selection-details {
        z-index: 10;
        position: relative;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Step 4: Fix Animation/Transition Issues
   */
  fixAnimationBehavior() {
    const style = document.createElement('style');
    style.textContent = `
      .iframe-embed .site-children,
      .iframe-embed .selection-details {
        transition: max-height ${this.config.transitionDuration}s ease-out;
        will-change: max-height;
      }
      
      @media (prefers-reduced-motion: reduce) {
        .iframe-embed .site-children,
        .iframe-embed .selection-details {
          transition: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Step 5: Handle Event Propagation Issues
   */
  fixEventHandling() {
    if (!this.isIframe) return;
    
    // Store original functions
    this.originalToggleNode = window.toggleNode;
    this.originalToggleSelectionDetails = window.toggleSelectionDetails;
    
    // Enhance existing functions with iframe optimizations
    if (window.toggleNode) {
      const originalToggleNode = window.toggleNode;
      window.toggleNode = (nodeId) => {
        // Call original function
        originalToggleNode(nodeId);
        
        // Add iframe-specific optimizations
        if (this.isIframe) {
          // Recalculate heights immediately after toggle
          requestAnimationFrame(() => {
            this.recalculateAccordionHeights();
          });
          
          // Also recalculate after a short delay to ensure DOM updates are complete
          setTimeout(() => {
            this.recalculateAccordionHeights();
          }, 100);
        }
      };
    }
    
    if (window.toggleSelectionDetails) {
      const originalToggleSelectionDetails = window.toggleSelectionDetails;
      window.toggleSelectionDetails = () => {
        // Call original function
        originalToggleSelectionDetails();
        
        // Add iframe-specific optimizations
        if (this.isIframe) {
          // Recalculate heights immediately after toggle
          requestAnimationFrame(() => {
            this.recalculateAccordionHeights();
          });
          
          // Also recalculate after a short delay to ensure DOM updates are complete
          setTimeout(() => {
            this.recalculateAccordionHeights();
          }, 100);
        }
      };
    }
  }

  /**
   * Step 6: Implement Container Query Fallback
   */
  implementContainerQueryFallback() {
    const style = document.createElement('style');
    style.textContent = `
      /* Modern approach with container queries */
      @container (max-height: 400px) {
        .site-children.expanded,
        .selection-details.expanded {
          max-height: 120px;
        }
      }
      
      /* Fallback for iframe without container query support */
      .iframe-embed .site-children.expanded {
        max-height: min(200px, 30vh);
        overflow-y: auto;
      }
      
      .iframe-embed .selection-details.expanded {
        max-height: min(150px, 25vh);
        overflow-y: auto;
      }
      
      /* Ensure bottom controls stay visible */
      .iframe-embed .bottom-controls {
        position: sticky;
        bottom: 0;
        background: var(--bg-color);
        border-top: 1px solid var(--border-color);
        padding-top: 16px;
        margin-top: 16px;
        z-index: 100;
      }
      
      /* Prevent accordion content from pushing beyond container */
      .iframe-embed .docs-tree {
        overflow-y: auto;
        max-height: calc(100vh - 200px); /* Reserve space for header and bottom controls */
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Toggle accordion functionality
   * @param {string} accordionId - The ID of the accordion to toggle
   */
  toggleAccordion(accordionId) {
    const accordion = document.querySelector(`#${accordionId}`);
    if (!accordion) return;
    
    const children = accordion.querySelector('.site-children');
    const toggle = accordion.querySelector('.tree-toggle');
    
    if (!children || !toggle) return;
    
    const isExpanded = children.classList.contains('expanded');
    
    // Close all other accordions (accordion-style behavior)
    // Only close others if we're opening this accordion (not if we're closing it)
    if (!isExpanded) {
      document.querySelectorAll('.site-children.expanded').forEach(child => {
        // Don't close the current accordion
        if (child !== children) {
          child.classList.remove('expanded');
          const parentToggle = child.parentElement.querySelector('.tree-toggle');
          if (parentToggle) {
            parentToggle.style.transform = 'rotate(0deg)';
          }
        }
      });
    }
    
    // Toggle current accordion
    children.classList.toggle('expanded');
    toggle.style.transform = children.classList.contains('expanded') ? 'rotate(90deg)' : 'rotate(0deg)';
    
    // Recalculate heights in iframe mode
    if (this.isIframe) {
      requestAnimationFrame(() => {
        this.recalculateAccordionHeights();
      });
    }
    
    return { accordionId, toggled: true };
  }

  /**
   * Handle site checkbox changes
   * @param {HTMLInputElement} checkbox - The site checkbox element
   */
  handleSiteCheckboxChange(checkbox) {
    if (!checkbox || !checkbox.dataset.site) return;
    
    const site = checkbox.dataset.site;
    const isChecked = checkbox.checked;
    
    // Initialize global variables if they don't exist
    if (!window.selectedPages) {
      window.selectedPages = new Set();
    }
    if (!window.updateSelectionCount) {
      window.updateSelectionCount = () => {};
    }
    
    // Get all page checkboxes for this site
    const pageCheckboxes = document.querySelectorAll(`.page-checkbox[data-site="${site}"]`);
    
    pageCheckboxes.forEach(pageCheckbox => {
      pageCheckbox.checked = isChecked;
      
      if (isChecked) {
        window.selectedPages.add(pageCheckbox.dataset.url);
      } else {
        window.selectedPages.delete(pageCheckbox.dataset.url);
      }
    });
    
    window.updateSelectionCount();
  }

  /**
   * Handle page checkbox changes
   * @param {HTMLInputElement} checkbox - The page checkbox element
   */
  handlePageCheckboxChange(checkbox) {
    if (!checkbox || !checkbox.dataset.url) return;
    
    const url = checkbox.dataset.url;
    const site = checkbox.dataset.site;
    const isChecked = checkbox.checked;
    
    // Initialize global variables if they don't exist
    if (!window.selectedPages) {
      window.selectedPages = new Set();
    }
    if (!window.updateSelectionCount) {
      window.updateSelectionCount = () => {};
    }
    if (!window.updateSiteCheckboxes) {
      window.updateSiteCheckboxes = () => {};
    }
    
    if (isChecked) {
      window.selectedPages.add(url);
    } else {
      window.selectedPages.delete(url);
    }
    
    window.updateSelectionCount();
    window.updateSiteCheckboxes();
  }

  /**
   * Initialize the accordion manager
   */
  init() {
    console.log('🚀 Initializing AccordionManager...');
    
    // Run diagnostics first
    this.runDiagnostics();
    
    // Apply fixes based on diagnostics
    if (this.isIframe) {
      document.body.classList.add('iframe-embed');
      this.fixLayoutContext();
      this.ensureProperMeasurement();
      this.fixStackingContext();
      this.fixAnimationBehavior();
      this.fixEventHandling();
      this.implementContainerQueryFallback();
    }
    
    console.log('✅ AccordionManager initialized');
  }

  /**
   * Cleanup method
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    // Restore original functions
    if (this.originalToggleNode) {
      window.toggleNode = this.originalToggleNode;
    }
    if (this.originalToggleSelectionDetails) {
      window.toggleSelectionDetails = this.originalToggleSelectionDetails;
    }
    
    console.log('🧹 AccordionManager destroyed');
  }
}

// Export the class and utility functions
export { AccordionManager };

// Utility functions for global use
export function diagnoseAccordionIssues() {
  const manager = new AccordionManager();
  return manager.runDiagnostics();
}

export function fixAccordionInIframe() {
  return new AccordionManager({ iframeMode: true });
}

// Auto-initialize if in iframe
if (typeof window !== 'undefined' && window.self !== window.top) {
  window.addEventListener('DOMContentLoaded', () => {
    window.accordionManager = new AccordionManager({ iframeMode: true });
  });
} 