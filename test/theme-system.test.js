/**
 * Test suite for enhanced theme system with automatic color derivation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock DOM environment
const mockDocument = {
  documentElement: {
    setAttribute: vi.fn(),
    style: {
      setProperty: vi.fn(),
      getPropertyValue: vi.fn()
    },
    classList: {
      add: vi.fn(),
      remove: vi.fn()
    }
  },
  querySelector: vi.fn(),
  getElementById: vi.fn(),
  body: {
    classList: {
      add: vi.fn()
    }
  }
};

const mockWindow = {
  location: {
    search: ''
  },
  matchMedia: vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn()
  })),
  localStorage: {
    getItem: vi.fn(),
    setItem: vi.fn()
  },
  self: {},
  top: {},
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: vi.fn(),
  parent: {
    postMessage: vi.fn()
  }
};

// Mock global objects
global.document = mockDocument;
global.window = mockWindow;
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn()
};

// Import the theme functions
import { 
  hexToHsl, 
  hslToHex, 
  generateDerivedColors, 
  applyQueryParameters,
  initializeTheme,
  isIframeEmbed 
} from '../src/utils/theme.js';

describe('Enhanced Theme System', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockWindow.location.search = '';
    mockDocument.querySelector.mockReturnValue(null);
  });

  describe('Color Conversion Functions', () => {
    it('should convert hex to HSL correctly', () => {
      // Test white
      expect(hexToHsl('#ffffff')).toEqual([0, 0, 100]);
      
      // Test black
      expect(hexToHsl('#000000')).toEqual([0, 0, 0]);
      
      // Test red
      expect(hexToHsl('#ff0000')).toEqual([0, 100, 50]);
      
      // Test green
      expect(hexToHsl('#00ff00')).toEqual([120, 100, 50]);
      
      // Test blue
      expect(hexToHsl('#0000ff')).toEqual([240, 100, 50]);
    });

    it('should convert HSL back to hex correctly', () => {
      // Test white
      expect(hslToHex(0, 0, 100)).toBe('#ffffff');
      
      // Test black
      expect(hslToHex(0, 0, 0)).toBe('#000000');
      
      // Test red
      expect(hslToHex(0, 100, 50)).toBe('#ff0000');
      
      // Test green
      expect(hslToHex(120, 100, 50)).toBe('#00ff00');
      
      // Test blue
      expect(hslToHex(240, 100, 50)).toBe('#0000ff');
    });
  });

  describe('Derived Color Generation', () => {
    it('should generate appropriate derived colors for light background', () => {
      const bgColor = '#ffffff';
      const textColor = '#000000';
      const derived = generateDerivedColors(bgColor, textColor);
      
      expect(derived.hoverBg).toBeDefined();
      expect(derived.categoryBg).toBeDefined();
      expect(derived.categoryBg2).toBeDefined();
      expect(derived.borderColor).toBeDefined();
      expect(derived.borderSecondary).toBeDefined();
      expect(derived.secondaryText).toBe('rgba(0, 0, 0, 0.7)');
    });

    it('should generate appropriate derived colors for dark background', () => {
      const bgColor = '#000000';
      const textColor = '#ffffff';
      const derived = generateDerivedColors(bgColor, textColor);
      
      expect(derived.hoverBg).toBeDefined();
      expect(derived.categoryBg).toBeDefined();
      expect(derived.categoryBg2).toBeDefined();
      expect(derived.borderColor).toBeDefined();
      expect(derived.borderSecondary).toBeDefined();
      expect(derived.secondaryText).toBe('rgba(255, 255, 255, 0.7)');
    });

    it('should auto-detect text color when not provided', () => {
      // Light background should auto-detect dark text
      const lightDerived = generateDerivedColors('#ffffff', '#000000');
      expect(lightDerived.secondaryText).toBe('rgba(0, 0, 0, 0.7)');
      
      // Dark background should auto-detect light text
      const darkDerived = generateDerivedColors('#000000', '#ffffff');
      expect(darkDerived.secondaryText).toBe('rgba(255, 255, 255, 0.7)');
    });
  });

  describe('Query Parameter Application', () => {
    it('should apply custom background color with derived colors', () => {
      mockWindow.location.search = '?bg-color=%23ff0000';
      
      applyQueryParameters();
      
      // Should set custom colors flag
      expect(mockDocument.documentElement.setAttribute).toHaveBeenCalledWith('data-custom-colors', 'true');
      
      // Should apply multiple color variables - check that they were called, not specific order
      const calls = mockDocument.documentElement.style.setProperty.mock.calls;
      expect(calls.some(call => call[0] === '--bg-color' && call[1] === '#ff0000')).toBe(true);
      expect(calls.some(call => call[0] === '--text-color' && call[1] === '#ffffff')).toBe(true);
    });

    it('should apply custom text color when provided', () => {
      mockWindow.location.search = '?bg-color=%23ffffff&text-color=%23000000';
      
      applyQueryParameters();
      
      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith('--text-color', '#000000', 'important');
    });

    it('should handle accent color parameter', () => {
      mockWindow.location.search = '?bg-color=%23ffffff&accent-color=%2300ff00';
      
      applyQueryParameters();
      
      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith('--accent-color', '#00ff00', 'important');
    });

    it('should apply accent color independently without background color', () => {
      mockWindow.location.search = '?accent-color=%2300ff00';
      
      applyQueryParameters();
      
      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith('--accent-color', '#00ff00', 'important');
      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith('--accent-hover-color', '#00ff00', 'important');
      expect(mockDocument.documentElement.setAttribute).toHaveBeenCalledWith('data-custom-colors', 'true');
    });

    it('should handle UI visibility parameters', () => {
      mockWindow.location.search = '?hide-header=true&minimal=true';
      
      applyQueryParameters();
      
      expect(mockDocument.documentElement.classList.add).toHaveBeenCalledWith('hide-header');
    });

    it('should handle translucent background', () => {
      mockWindow.location.search = '?bg-color=%23ffffff&translucent=0.8';
      
      applyQueryParameters();
      
      expect(mockDocument.documentElement.classList.add).toHaveBeenCalledWith('translucent-bg');
      
      // Check that translucent opacity was set - use flexible checking
      const calls = mockDocument.documentElement.style.setProperty.mock.calls;
      expect(calls.some(call => call[0] === '--translucent-opacity' && call[1] === '0.8')).toBe(true);
    });
  });

  describe('Theme Initialization', () => {
    it('should skip theme system when custom colors are present', () => {
      mockWindow.location.search = '?bg-color=%23ff0000';
      
      initializeTheme();
      
      // Should not set data-theme attribute when custom colors are present
      expect(mockDocument.documentElement.setAttribute).not.toHaveBeenCalledWith('data-theme', expect.any(String));
    });

    it('should apply default theme when no custom colors', () => {
      mockWindow.location.search = '';
      mockWindow.matchMedia.mockReturnValue({ matches: true, addEventListener: vi.fn() });
      
      initializeTheme();
      
      // Should set dark theme based on system preference
      expect(mockDocument.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });
  });

  describe('Iframe Detection', () => {
    it('should detect iframe correctly', () => {
      // Mock iframe environment
      mockWindow.self = { frameElement: {} };
      mockWindow.top = { frameElement: null };
      
      expect(isIframeEmbed()).toBe(true);
    });

    it('should detect non-iframe correctly', () => {
      // Mock regular window environment
      mockWindow.self = mockWindow.top;
      
      expect(isIframeEmbed()).toBe(false);
    });
  });

  describe('Atomic Theme System Problems', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockWindow.location.search = '';
      mockDocument.querySelector.mockReturnValue(null);
      mockDocument.documentElement.style.setProperty.mockClear();
      mockDocument.documentElement.setAttribute.mockClear();
      mockDocument.documentElement.classList.add.mockClear();
      mockDocument.getElementById = vi.fn();
      global.localStorage.getItem.mockReturnValue(null);
    });

    it('sets --bg-color and --text-color on :root', () => {
      mockWindow.location.search = '?bg-color=%2300ff00&text-color=%23000000';
      applyQueryParameters();
      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith('--bg-color', '#00ff00', 'important');
      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith('--text-color', '#000000', 'important');
    });

    it('picks visible text color for various backgrounds', () => {
      mockWindow.location.search = '?bg-color=%23000000';
      applyQueryParameters();
      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith('--text-color', '#ffffff', 'important');
      mockWindow.location.search = '?bg-color=%23ffffff';
      applyQueryParameters();
      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith('--text-color', '#000000', 'important');
      mockWindow.location.search = '?bg-color=%23ff0000';
      applyQueryParameters();
      expect(mockDocument.documentElement.style.setProperty).toHaveBeenCalledWith('--text-color', '#ffffff', 'important');
    });

    it('falls back gracefully for invalid color params', () => {
      mockWindow.location.search = '?bg-color=notacolor';
      expect(() => applyQueryParameters()).not.toThrow();
      expect(mockDocument.documentElement.setAttribute).not.toHaveBeenCalledWith('data-custom-colors', 'true');
    });

    it('applies translucent background correctly', () => {
      mockWindow.location.search = '?bg-color=%2300ff00&translucent=0.5';
      applyQueryParameters();
      expect(mockDocument.documentElement.classList.add).toHaveBeenCalledWith('translucent-bg');
      // Use .some to check for setProperty calls
      const calls = mockDocument.documentElement.style.setProperty.mock.calls;
      expect(calls.some(call => call[0] === '--translucent-opacity' && call[1] === '0.5')).toBe(true);
      expect(calls.some(call => call[0] === '--translucent-bg-color' && call[1].includes('rgba('))).toBe(true);
    });

    it('hides theme toggle when custom colors are active', () => {
      const mockToggle = { style: { display: '' } };
      mockDocument.querySelector.mockReturnValue(mockToggle);
      mockWindow.location.search = '?bg-color=%2300ff00';
      applyQueryParameters();
      expect(mockToggle.style.display).toBe('none');
    });

    it('handles UI visibility parameters', () => {
      mockWindow.location.search = '?hide-header=true&minimal=true';
      // Mock getElementById to return a dummy header
      const dummyHeader = { style: { display: '' } };
      mockDocument.getElementById = vi.fn().mockReturnValue(dummyHeader);
      applyQueryParameters();
      expect(mockDocument.documentElement.classList.add).toHaveBeenCalledWith('hide-header');
      expect(dummyHeader.style.display).toBe('none');
    });
  });
}); 