/**
 * Enhanced theme management with automatic color derivation
 */

/**
 * Convert hex to HSL for color manipulation
 */
export function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return [h * 360, s * 100, l * 100];
}

/**
 * Convert HSL back to hex
 */
export function hslToHex(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1/3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1/3);

  const toHex = (c) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Calculate contrast ratio between two hex colors (WCAG 2.0)
 */
function getLuminance(hex) {
  const rgb = [1, 3, 5].map(i => {
    let c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function getContrastRatio(hex1, hex2) {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  return (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
}

/**
 * Generate derived colors from base background color
 */
export function generateDerivedColors(bgColor, textColor) {
  const [h, s, l] = hexToHsl(bgColor);
  const isDark = l < 50;
  
  // Calculate derived colors based on background
  const hoverBg = isDark 
    ? hslToHex(h, s, Math.min(l + 8, 95))  // Lighter for dark themes
    : hslToHex(h, s, Math.max(l - 8, 5));  // Darker for light themes
    
  const categoryBg = isDark
    ? hslToHex(h, Math.max(s - 10, 0), Math.min(l + 5, 90))
    : hslToHex(h, Math.max(s - 10, 0), Math.max(l - 5, 10));
    
  const categoryBg2 = isDark
    ? hslToHex(h, Math.max(s - 15, 0), Math.min(l + 10, 85))
    : hslToHex(h, Math.max(s - 15, 0), Math.max(l - 10, 15));
    
  const borderColor = isDark
    ? hslToHex(h, Math.max(s - 20, 0), Math.min(l + 15, 80))
    : hslToHex(h, Math.max(s - 20, 0), Math.max(l - 15, 20));
    
  const borderSecondary = isDark
    ? hslToHex(h, Math.max(s - 25, 0), Math.min(l + 25, 75))
    : hslToHex(h, Math.max(s - 25, 0), Math.max(l - 25, 25));

  // Generate secondary text color (70% opacity of text color)
  const [tr, tg, tb] = [
    parseInt(textColor.slice(1, 3), 16),
    parseInt(textColor.slice(3, 5), 16),
    parseInt(textColor.slice(5, 7), 16)
  ];
  const secondaryText = `rgba(${tr}, ${tg}, ${tb}, 0.7)`;

  return {
    hoverBg,
    categoryBg,
    categoryBg2,
    borderColor,
    borderSecondary,
    secondaryText
  };
}

/**
 * Apply comprehensive color scheme
 */
export function applyQueryParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  
  // UI visibility parameters (unchanged)
  const hideHeader = urlParams.get('hide-header');
  if (hideHeader === 'true' || hideHeader === '1') {
    document.documentElement.classList.add('hide-header');
  }
  
  const isMinimal = urlParams.get('minimal') === 'true';
  if (isMinimal) {
    const headerContent = document.getElementById('header-content');
    if (headerContent) {
      headerContent.style.display = 'none';
    }
  }
  
  const translucent = urlParams.get('translucent');
  if (translucent) {
    document.documentElement.classList.add('translucent-bg');
    const opacity = parseFloat(translucent);
    if (!isNaN(opacity) && opacity >= 0 && opacity <= 1) {
      document.documentElement.style.setProperty('--translucent-opacity', opacity);
    }
  }
  
  // Enhanced color parameter handling
  const bgColor = urlParams.get('bg-color') || urlParams.get('background');
  let textColor = urlParams.get('text-color') || urlParams.get('text');
  const accentColor = urlParams.get('accent-color') || urlParams.get('link-color') || urlParams.get('primary');
  const borderColor = urlParams.get('border-color');
  
  const root = document.documentElement;
  let hasCustomColors = false;
  
  // Apply accent color independently (Component 1 fix)
  if (accentColor && /^#([0-9A-F]{3}){1,2}$/i.test(accentColor)) {
    root.style.setProperty('--accent-color', accentColor, 'important');
    root.style.setProperty('--accent-hover-color', accentColor, 'important');
    hasCustomColors = true;
  }
  
  // Apply background color and derived colors if present
  if (bgColor && /^#([0-9A-F]{3}){1,2}$/i.test(bgColor)) {
    hasCustomColors = true;
    
    // Pick best text color if not provided
    if (!textColor || !/^#([0-9A-F]{3}){1,2}$/i.test(textColor)) {
      const blackContrast = getContrastRatio(bgColor, '#000000');
      const whiteContrast = getContrastRatio(bgColor, '#ffffff');
      textColor = blackContrast >= whiteContrast ? '#000000' : '#ffffff';
    }
    
    const derived = generateDerivedColors(bgColor, textColor);
    
    // Apply all color variables with !important
    const colorMap = {
      '--bg-color': bgColor,
      '--text-color': textColor,
      '--border-color': borderColor || derived.borderColor,
      '--border-secondary-color': derived.borderSecondary,
      '--input-bg': bgColor,
      '--hover-bg': derived.hoverBg,
      '--category-bg': derived.categoryBg,
      '--category-bg-2': derived.categoryBg2,
      '--category-text': textColor,
      '--result-bg': bgColor,
      '--result-hover': derived.hoverBg,
      '--heading-color': textColor,
      '--button-bg': accentColor || textColor,
      '--button-text': bgColor,
      '--button-hover-bg': accentColor || derived.hoverBg,
      '--secondary-text': derived.secondaryText,
      '--section-bg': derived.categoryBg,
      '--section-color': textColor,
      '--tag-bg': derived.borderColor,
      '--tag-text': textColor
    };
    
    Object.entries(colorMap).forEach(([property, value]) => {
      root.style.setProperty(property, value, 'important');
    });
    
    // Handle translucent background
    if (translucent) {
      const r = parseInt(bgColor.slice(1, 3), 16);
      const g = parseInt(bgColor.slice(3, 5), 16);
      const b = parseInt(bgColor.slice(5, 7), 16);
      const a = root.style.getPropertyValue('--translucent-opacity') || 0.92;
      root.style.setProperty('--translucent-bg-color', `rgba(${r}, ${g}, ${b}, ${a})`, 'important');
    }
  }
  
  // Set custom colors flag if any custom colors were applied
  if (hasCustomColors) {
    root.setAttribute('data-custom-colors', 'true');
    
    // Disable theme toggle
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
      themeToggle.style.display = 'none';
    }
  }
}

/**
 * Initialize theme system with enhanced color support
 */
export function initializeTheme() {
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  
  // Check for custom colors first
  const urlParams = new URLSearchParams(window.location.search);
  const hasCustomColors = ['bg-color', 'background', 'text-color', 'text'].some(param => urlParams.get(param));
  
  if (hasCustomColors) {
    // Apply custom colors and skip theme system
    applyQueryParameters();
    return;
  }
  
  // Standard theme system for non-custom cases
  function getInitialTheme() {
    const stored = localStorage.getItem('theme');
    if (stored && ['light', 'dark'].includes(stored)) {
      return stored;
    }
    return prefersDarkScheme.matches ? 'dark' : 'light';
  }
  
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeToggle();
  }
  
  function updateThemeToggle() {
    const toggle = document.querySelector('.theme-toggle');
    if (toggle && !isIframeEmbed()) {
      toggle.style.display = 'flex';
    }
  }
  
  // Set up theme toggle
  const themeToggle = document.querySelector('.theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
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
  
  // Apply initial theme
  applyTheme(getInitialTheme());
}

/**
 * Detect if running in iframe
 * @returns {boolean}
 */
export function isIframeEmbed() {
  return window.self !== window.top;
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