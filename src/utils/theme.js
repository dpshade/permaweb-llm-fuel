/**
 * Theme management utilities - matches permaweb-glossary behavior
 */

/**
 * Detect if running in iframe
 * @returns {boolean}
 */
export function isIframeEmbed() {
  return window.self !== window.top;
}

/**
 * Apply URL parameters for visual customization
 */
export function applyQueryParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  
  // ===== UI VISIBILITY PARAMETERS =====
  
  // Handle hide-header parameter
  const hideHeader = urlParams.get('hide-header');
  if (hideHeader === 'true' || hideHeader === '1') {
    document.documentElement.classList.add('hide-header');
  }
  
  // Handle translucent background parameter
  const translucent = urlParams.get('translucent');
  if (translucent) {
    document.documentElement.classList.add('translucent-bg');
    
    // Apply custom opacity if numeric value is provided
    const opacity = parseFloat(translucent);
    if (!isNaN(opacity) && opacity >= 0 && opacity <= 1) {
      document.documentElement.style.setProperty('--translucent-opacity', opacity);
    }
  }
  
  // ===== COLOR PARAMETERS =====
  const colorParams = {
    '--background-color': urlParams.get('bg-color'),
    '--text-color': urlParams.get('text-color'),
    '--border-color': urlParams.get('border-color'),
    '--input-bg': urlParams.get('input-bg') || urlParams.get('bg-color'),
    '--hover-bg': urlParams.get('hover-bg'),
    '--category-bg': urlParams.get('category-bg'),
    '--category-text': urlParams.get('category-text'),
    '--link-color': urlParams.get('link-color'),
    '--result-bg': urlParams.get('result-bg') || urlParams.get('bg-color'),
    '--result-hover': urlParams.get('result-hover') || urlParams.get('hover-bg'),
    '--heading-color': urlParams.get('heading-color') || urlParams.get('text-color'),
    '--tag-bg': urlParams.get('tag-bg') || urlParams.get('border-color'),
    '--tag-text': urlParams.get('tag-text') || urlParams.get('bg-color'),
    '--button-bg': urlParams.get('button-bg') || urlParams.get('border-color'),
    '--button-text': urlParams.get('button-text') || urlParams.get('bg-color'),
    '--accent-color': urlParams.get('accent-color') || urlParams.get('link-color'),
    '--secondary-text': urlParams.get('secondary-text') || urlParams.get('category-text')
  };
  
  // Apply any colors that were provided as URL parameters
  const root = document.documentElement;
  
  Object.entries(colorParams).forEach(([varName, value]) => {
    if (value && /^#([0-9A-F]{3}){1,2}$/i.test(value)) {
      root.style.setProperty(varName, value);
      
      // Special handling for bg-color when translucent is enabled
      if (varName === '--background-color' && translucent) {
        let r, g, b;
        
        if (value.length === 4) {
          r = parseInt(value[1] + value[1], 16);
          g = parseInt(value[2] + value[2], 16);
          b = parseInt(value[3] + value[3], 16);
        } else {
          r = parseInt(value.slice(1, 3), 16);
          g = parseInt(value.slice(3, 5), 16);
          b = parseInt(value.slice(5, 7), 16);
        }
        
        const a = root.style.getPropertyValue('--translucent-opacity') || 0.92;
        root.style.setProperty('--translucent-bg-color', `rgba(${r}, ${g}, ${b}, ${a})`);
      }
    }
  });
}

/**
 * Initialize theme system
 */
export function initializeTheme() {
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  
  // Get initial theme
  function getInitialTheme() {
    const stored = localStorage.getItem('theme');
    if (stored && ['light', 'dark'].includes(stored)) {
      return stored;
    }
    return prefersDarkScheme.matches ? 'dark' : 'light';
  }
  
  // Apply theme
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeToggle(theme);
  }
  
  // Update theme toggle button
  function updateThemeToggle(theme) {
    const toggle = document.querySelector('.theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`);
    }
  }
  
  // Initialize
  const initialTheme = getInitialTheme();
  applyTheme(initialTheme);
  
  // Set up theme toggle
  const themeToggle = document.querySelector('.theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
    });
  }
  
  // Listen for system theme changes
  prefersDarkScheme.addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}

/**
 * Initialize iframe-specific behavior
 */
export function initializeIframeMode() {
  if (isIframeEmbed()) {
    document.documentElement.classList.add('iframe-embed');
    
    // Listen for messages from parent page
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'theme') {
        document.documentElement.setAttribute('data-theme', event.data.theme);
      }
      
      if (event.data && event.data.type === 'resize') {
        // Handle resize if needed
      }
    });
    
    // Send ready message to parent
    window.parent.postMessage({ type: 'ready' }, '*');
  }
}

/**
 * Auto-detect iframe mode based on window dimensions
 */
export function autoDetectIframeMode() {
  // If window is smaller than typical browser window, assume iframe
  if (window.innerWidth < 800 && window.innerHeight < 600) {
    document.body.classList.add('iframe-detected');
  }
}

/**
 * Initialize all theme-related functionality
 */
export function initializeAllTheme() {
  // Apply URL parameters first
  applyQueryParameters();
  
  // Initialize theme system
  initializeTheme();
  
  // Initialize iframe mode
  initializeIframeMode();
  
  // Auto-detect iframe mode
  autoDetectIframeMode();
}

/**
 * Create theme toggle button HTML
 * @returns {string} HTML string for theme toggle
 */
export function createThemeToggleHTML() {
  return `
    <button class="theme-toggle" aria-label="Toggle theme">
      <svg class="sun-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
      <svg class="moon-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    </button>
  `;
}