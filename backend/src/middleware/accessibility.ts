/**
 * Accessibility middleware for WCAG 2.1 AA compliance.
 * Enhances API responses with accessibility features and ensures
 * proper accessibility headers and metadata.
 */

import type { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';
import { config } from '../config';

/**
 * Accessibility configuration options
 */
export interface AccessibilityConfig {
  enabled: boolean;
  enforceWCAG: boolean;
  addAccessibilityHeaders: boolean;
  generateAltText: boolean;
  enableSkipLinks: boolean;
  focusManagement: boolean;
  colorContrast: {
    minimumRatio: number;
    enforce: boolean;
  };
  screenReader: {
    enabled: boolean;
    liveRegions: boolean;
  };
}

/**
 * Default accessibility configuration
 */
export const defaultAccessibilityConfig: AccessibilityConfig = {
  enabled: true,
  enforceWCAG: config.NODE_ENV === 'production',
  addAccessibilityHeaders: true,
  generateAltText: true,
  enableSkipLinks: true,
  focusManagement: true,
  colorContrast: {
    minimumRatio: 4.5, // WCAG AA minimum contrast ratio
    enforce: config.NODE_ENV === 'production'
  },
  screenReader: {
    enabled: true,
    liveRegions: true
  }
};

/**
 * Accessibility error with detailed information
 */
export class AccessibilityError extends Error {
  constructor(
    message: string,
    public readonly issue: string,
    public readonly wcagCriteria: string,
    public readonly severity: 'A' | 'AA' | 'AAA',
    public readonly element?: string,
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = 'AccessibilityError';
  }
}

/**
 * Accessibility audit result for a single check
 */
export interface AccessibilityCheckResult {
  check: string;
  passed: boolean;
  severity: 'A' | 'AA' | 'AAA';
  description: string;
  suggestion?: string;
  element?: string;
  wcagCriteria: string;
}

/**
 * Complete accessibility audit result
 */
export interface AccessibilityAuditResult {
  url: string;
  timestamp: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  complianceLevel: 'A' | 'AA' | 'AAA' | 'None';
  issues: AccessibilityCheckResult[];
  warnings: AccessibilityCheckResult[];
  recommendations: string[];
}

/**
 * Accessibility metadata for API responses
 */
export interface AccessibilityMetadata {
  conformanceLevel: 'A' | 'AA' | 'AAA';
  accessibilityFeatures: string[];
  language: string;
  skipLinks: Array<{ id: string; text: string }>;
  focusOrder: string[];
  screenReaderHint?: string;
  keyboardNavigation: boolean;
}

/**
 * WCAG 2.1 guidelines and success criteria
 */
export const wcagGuidelines: Record<string, {
  description: string;
  level: 'A' | 'AA' | 'AAA';
  category: 'Perceivable' | 'Operable' | 'Understandable' | 'Robust';
}> = {
  // Perceivable
  '1.1.1': { description: 'Non-text Content', level: 'A', category: 'Perceivable' },
  '1.2.1': { description: 'Audio-only and Video-only (Prerecorded)', level: 'A', category: 'Perceivable' },
  '1.2.2': { description: 'Captions (Prerecorded)', level: 'A', category: 'Perceivable' },
  '1.2.3': { description: 'Audio Description or Media Alternative (Prerecorded)', level: 'A', category: 'Perceivable' },
  '1.3.1': { description: 'Info and Relationships', level: 'A', category: 'Perceivable' },
  '1.3.2': { description: 'Meaningful Sequence', level: 'A', category: 'Perceivable' },
  '1.3.3': { description: 'Sensory Characteristics', level: 'A', category: 'Perceivable' },
  '1.4.1': { description: 'Use of Color', level: 'A', category: 'Perceivable' },
  '1.4.2': { description: 'Audio Control', level: 'A', category: 'Perceivable' },
  '1.4.3': { description: 'Contrast (Minimum)', level: 'AA', category: 'Perceivable' },
  '1.4.4': { description: 'Resize text', level: 'AA', category: 'Perceivable' },
  '1.4.10': { description: 'Reflow', level: 'AA', category: 'Perceivable' },
  '1.4.11': { description: 'Non-text Contrast', level: 'AA', category: 'Perceivable' },
  '1.4.12': { description: 'Text Spacing', level: 'AA', category: 'Perceivable' },
  '1.4.13': { description: 'Content on Hover or Focus', level: 'AA', category: 'Perceivable' },
  
  // Operable
  '2.1.1': { description: 'Keyboard', level: 'A', category: 'Operable' },
  '2.1.2': { description: 'No Keyboard Trap', level: 'A', category: 'Operable' },
  '2.1.4': { description: 'Character Key Shortcuts', level: 'A', category: 'Operable' },
  '2.2.1': { description: 'Timing Adjustable', level: 'A', category: 'Operable' },
  '2.2.2': { description: 'Pause, Stop, Hide', level: 'A', category: 'Operable' },
  '2.3.1': { description: 'Three Flashes or Below Threshold', level: 'A', category: 'Operable' },
  '2.4.1': { description: 'Bypass Blocks', level: 'A', category: 'Operable' },
  '2.4.2': { description: 'Page Titled', level: 'A', category: 'Operable' },
  '2.4.3': { description: 'Focus Order', level: 'A', category: 'Operable' },
  '2.4.4': { description: 'Link Purpose (In Context)', level: 'A', category: 'Operable' },
  '2.4.6': { description: 'Headings and Labels', level: 'AA', category: 'Operable' },
  '2.4.7': { description: 'Focus Visible', level: 'AA', category: 'Operable' },
  
  // Understandable
  '3.1.1': { description: 'Language of Page', level: 'A', category: 'Understandable' },
  '3.1.2': { description: 'Language of Parts', level: 'AA', category: 'Understandable' },
  '3.2.1': { description: 'On Focus', level: 'A', category: 'Understandable' },
  '3.2.2': { description: 'On Input', level: 'A', category: 'Understandable' },
  '3.2.3': { description: 'Consistent Navigation', level: 'AA', category: 'Understandable' },
  '3.2.4': { description: 'Consistent Identification', level: 'AA', category: 'Understandable' },
  '3.3.1': { description: 'Error Identification', level: 'A', category: 'Understandable' },
  '3.3.2': { description: 'Labels or Instructions', level: 'A', category: 'Understandable' },
  '3.3.3': { description: 'Error Suggestion', level: 'AA', category: 'Understandable' },
  '3.3.4': { description: 'Error Prevention (Legal, Financial, Data)', level: 'AA', category: 'Understandable' },
  
  // Robust
  '4.1.1': { description: 'Parsing', level: 'A', category: 'Robust' },
  '4.1.2': { description: 'Name, Role, Value', level: 'A', category: 'Robust' },
  '4.1.3': { description: 'Status Messages', level: 'AA', category: 'Robust' },
  
  // Level AAA
  '1.4.6': { description: 'Contrast (Enhanced)', level: 'AAA', category: 'Perceivable' },
  '1.4.9': { description: 'Images of Text (No Exception)', level: 'AAA', category: 'Perceivable' },
  '2.1.3': { description: 'Keyboard (No Exception)', level: 'AAA', category: 'Operable' },
  '2.2.4': { description: 'Interruptions', level: 'AAA', category: 'Operable' },
  '2.4.8': { description: 'Location', level: 'AAA', category: 'Operable' },
  '2.4.9': { description: 'Link Purpose (Link Only)', level: 'AAA', category: 'Operable' },
  '2.4.10': { description: 'Section Headings', level: 'AAA', category: 'Operable' },
  '3.1.5': { description: 'Reading Level', level: 'AAA', category: 'Understandable' },
  '3.1.6': { description: 'Pronunciation', level: 'AAA', category: 'Understandable' },
  '3.2.5': { description: 'Change on Request', level: 'AAA', category: 'Understandable' },
  '3.3.5': { description: 'Help', level: 'AAA', category: 'Understandable' },
  '3.3.6': { description: 'Error Prevention (All)', level: 'AAA', category: 'Understandable' },
};

/**
 * ARIA roles and properties for common elements
 */
export const ariaRoles = {
  alert: 'alert',
  alertdialog: 'alertdialog',
  application: 'application',
  article: 'article',
  banner: 'banner',
  button: 'button',
  cell: 'cell',
  checkbox: 'checkbox',
  columnheader: 'columnheader',
  combobox: 'combobox',
  complementary: 'complementary',
  contentinfo: 'contentinfo',
  definition: 'definition',
  dialog: 'dialog',
  directory: 'directory',
  document: 'document',
  feed: 'feed',
  figure: 'figure',
  form: 'form',
  grid: 'grid',
  gridcell: 'gridcell',
  group: 'group',
  heading: 'heading',
  img: 'img',
  link: 'link',
  list: 'list',
  listbox: 'listbox',
  listitem: 'listitem',
  log: 'log',
  main: 'main',
  marquee: 'marquee',
  math: 'math',
  menu: 'menu',
  menubar: 'menubar',
  menuitem: 'menuitem',
  menuitemcheckbox: 'menuitemcheckbox',
  menuitemradio: 'menuitemradio',
  navigation: 'navigation',
  none: 'none',
  note: 'note',
  option: 'option',
  presentation: 'presentation',
  progressbar: 'progressbar',
  radio: 'radio',
  radiogroup: 'radiogroup',
  region: 'region',
  row: 'row',
  rowgroup: 'rowgroup',
  rowheader: 'rowheader',
  scrollbar: 'scrollbar',
  search: 'search',
  section: 'section',
  searchbox: 'searchbox',
  separator: 'separator',
  slider: 'slider',
  spinbutton: 'spinbutton',
  status: 'status',
  switch: 'switch',
  tab: 'tab',
  table: 'table',
  tablist: 'tablist',
  tabpanel: 'tabpanel',
  term: 'term',
  textbox: 'textbox',
  timer: 'timer',
  toolbar: 'toolbar',
  tooltip: 'tooltip',
  tree: 'tree',
  treegrid: 'treegrid',
  treeitem: 'treeitem'
} as const;

/**
 * Middleware to add accessibility headers to responses
 */
export function accessibilityHeaders(config: Partial<AccessibilityConfig> = {}) {
  const mergedConfig = { ...defaultAccessibilityConfig, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    if (!mergedConfig.addAccessibilityHeaders) {
      return next();
    }

    // Add accessibility headers for screen readers and assistive technologies
    res.setHeader('X-Accessibility-Conformance', 'WCAG 2.1 AA');
    res.setHeader('X-Accessibility-Language', 'en-US');
    
    // Add headers for caching control of accessible content
    res.setHeader('Vary', 'Accept, Accept-Language');
    
    // Add CSP header to allow assistive technologies
    const existingCsp = res.getHeader('Content-Security-Policy');
    if (existingCsp && typeof existingCsp === 'string') {
      res.setHeader('Content-Security-Policy', `${existingCsp}; script-src 'unsafe-inline' 'unsafe-eval'`);
    }

    next();
  };
}

/**
 * Middleware to ensure proper language headers
 */
export function languageHeaders(language: string = 'en-US') {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set Content-Language header
    res.setHeader('Content-Language', language);
    
    // Set Accept-Language in Vary header
    const vary = res.getHeader('Vary');
    if (vary) {
      if (Array.isArray(vary)) {
        if (!vary.includes('Accept-Language')) {
          res.setHeader('Vary', [...vary, 'Accept-Language']);
        }
      } else if (typeof vary === 'string') {
        if (!vary.includes('Accept-Language')) {
          res.setHeader('Vary', `${vary}, Accept-Language`);
        }
      }
    } else {
      res.setHeader('Vary', 'Accept-Language');
    }

    next();
  };
}

/**
 * Middleware to add skip link functionality
 */
export function skipLinksMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store skip links in response locals
    res.locals.skipLinks = [
      { href: '#main', text: 'Skip to main content' },
      { href: '#navigation', text: 'Skip to navigation' },
      { href: '#search', text: 'Skip to search' }
    ];

    next();
  };
}

/**
 * Middleware to ensure keyboard navigation support
 */
export function keyboardNavigationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set flag that keyboard navigation is supported
    res.locals.keyboardNavigation = true;
    
    // Add keyboard shortcuts metadata
    res.locals.keyboardShortcuts = {
      escape: 'Close dialogs/modals',
      tab: 'Navigate through focusable elements',
      'shift+tab': 'Navigate backwards through focusable elements',
      enter: 'Activate buttons and links',
      space: 'Activate buttons and toggle controls',
      'shift+?': 'Show keyboard shortcuts help'
    };

    next();
  };
}

/**
 * Middleware to validate color contrast for API responses with color information
 */
export function colorContrastValidator() {
  return (req: Request, res: Response, next: NextFunction) => {
    // This would validate any color data in the response
    // For API responses, we check if the response contains color data
    const originalJson = res.json;
    
    res.json = function(data: unknown) {
      if (defaultAccessibilityConfig.colorContrast.enforce) {
        const validation = validateColorContrast(data);
        if (!validation.valid) {
          logger.warn('Color contrast validation failed', {
            issues: validation.issues,
            path: req.path
          });
          
          // Add accessibility warnings to response
          if (!res.locals.accessibility) {
            res.locals.accessibility = {};
          }
          (res.locals.accessibility as Record<string, unknown>).warnings = validation.issues;
        }
      }
      
      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Validate color contrast in data
 */
export function validateColorContrast(data: unknown): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (!data || typeof data !== 'object') {
    return { valid: true, issues: [] };
  }

  // Flatten the object to check all color properties
  const flatData = flattenObject(data as Record<string, unknown>);
  
  for (const [key, value] of Object.entries(flatData)) {
    if (key.toLowerCase().includes('color') && typeof value === 'string') {
      const colors = extractColors(value);
      for (const color of colors) {
        // Check if color has sufficient contrast with white and black
        const contrastWithWhite = calculateContrast(color, '#FFFFFF');
        const contrastWithBlack = calculateContrast(color, '#000000');
        
        if (contrastWithWhite < defaultAccessibilityConfig.colorContrast.minimumRatio &&
            contrastWithBlack < defaultAccessibilityConfig.colorContrast.minimumRatio) {
          issues.push(`Color ${value} at ${key} has insufficient contrast (white: ${contrastWithWhite.toFixed(2)}, black: ${contrastWithBlack.toFixed(2)})`);
        }
      }
    }
  }

  // Check foreground/background color pairs for sufficient contrast
  const backgroundKeys = Object.keys(flatData).filter(k => k.toLowerCase().includes('background'));
  const foregroundKeys = Object.keys(flatData).filter(
    k => k.toLowerCase().includes('color') && !k.toLowerCase().includes('background')
  );
  for (const bgKey of backgroundKeys) {
    for (const fgKey of foregroundKeys) {
      const bg = flatData[bgKey];
      const fg = flatData[fgKey];
      if (typeof bg === 'string' && typeof fg === 'string') {
        const ratio = calculateContrast(fg, bg);
        if (ratio < defaultAccessibilityConfig.colorContrast.minimumRatio) {
          issues.push(`Insufficient contrast between ${fgKey} (${fg}) and ${bgKey} (${bg}): ${ratio.toFixed(2)}`);
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Flatten an object to check all properties
 */
function flattenObject(obj: Record<string, unknown>, prefix: string = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else if (Array.isArray(value)) {
      result[fullKey] = value;
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Extract colors from a string value
 */
function extractColors(value: string): string[] {
  const colors: string[] = [];
  
  // Match hex colors (#rgb or #rrggbb)
  const hexMatch = value.match(/#[0-9a-fA-F]{3,6}\b/g);
  if (hexMatch) {
    colors.push(...hexMatch);
  }

  // Match rgb/rgba colors
  const rgbMatch = value.match(/rgb\([^)]+\)|rgba\([^)]+\)/g);
  if (rgbMatch) {
    colors.push(...rgbMatch);
  }

  // Match hsl/hsla colors
  const hslMatch = value.match(/hsl\([^)]+\)|hsla\([^)]+\)/g);
  if (hslMatch) {
    colors.push(...hslMatch);
  }

  // Match named colors
  const namedColors = ['red', 'green', 'blue', 'white', 'black', 'yellow', 'cyan', 'magenta'];
  const namedMatch = value.match(new RegExp(`\\b(${namedColors.join('|')})\\b`, 'gi'));
  if (namedMatch) {
    colors.push(...namedMatch);
  }

  return colors;
}

/**
 * Calculate contrast ratio between two colors
 */
export function calculateContrast(color1: string, color2: string): number {
  const rgb1 = parseColor(color1);
  const rgb2 = parseColor(color2);
  
  if (!rgb1 || !rgb2) {
    return 1; // Default contrast for unparseable colors
  }

  // Calculate relative luminance
  const l1 = calculateLuminance(rgb1);
  const l2 = calculateLuminance(rgb2);

  // Calculate contrast ratio
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse a color string to RGB values
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  color = color.trim().toLowerCase();

  // Hex colors
  if (color.startsWith('#')) {
    color = color.substring(1);
    if (color.length === 3) {
      const r = parseInt(color[0] + color[0], 16);
      const g = parseInt(color[1] + color[1], 16);
      const b = parseInt(color[2] + color[2], 16);
      return { r, g, b };
    } else if (color.length === 6) {
      const r = parseInt(color.substring(0, 2), 16);
      const g = parseInt(color.substring(2, 4), 16);
      const b = parseInt(color.substring(4, 6), 16);
      return { r, g, b };
    }
  }

  // RGB colors
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10)
    };
  }

  // RGBA colors
  const rgbaMatch = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10),
      g: parseInt(rgbaMatch[2], 10),
      b: parseInt(rgbaMatch[3], 10)
    };
  }

  // Named colors
  const namedColors: Record<string, { r: number; g: number; b: number }> = {
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    white: { r: 255, g: 255, b: 255 },
    black: { r: 0, g: 0, b: 0 },
    yellow: { r: 255, g: 255, b: 0 },
    cyan: { r: 0, g: 255, b: 255 },
    magenta: { r: 255, g: 0, b: 255 }
  };

  if (namedColors[color]) {
    return namedColors[color];
  }

  return null;
}

/**
 * Calculate relative luminance of an RGB color
 */
function calculateLuminance(rgb: { r: number; g: number; b: number }): number {
  // Convert RGB values to sRGB
  const sr = rgb.r / 255;
  const sg = rgb.g / 255;
  const sb = rgb.b / 255;

  // Apply gamma correction
  const r = sr <= 0.03928 ? sr / 12.92 : Math.pow((sr + 0.055) / 1.055, 2.4);
  const g = sg <= 0.03928 ? sg / 12.92 : Math.pow((sg + 0.055) / 1.055, 2.4);
  const b = sb <= 0.03928 ? sb / 12.92 : Math.pow((sb + 0.055) / 1.055, 2.4);

  // Calculate relative luminance
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Generate ARIA attributes for an element
 */
export function generateAriaAttributes(
  elementType: string,
  properties: Record<string, unknown> = {}
): Record<string, string> {
  const aria: Record<string, string> = {};

  // Determine the appropriate role
  const role = getAriaRole(elementType, properties);
  if (role) {
    aria['role'] = role;
  }

  // Add common ARIA attributes
  if (properties.label) {
    aria['aria-label'] = String(properties.label);
  }

  if (properties.describedBy) {
    aria['aria-describedby'] = String(properties.describedBy);
  }

  if (properties.hidden) {
    aria['aria-hidden'] = String(properties.hidden);
  }

  if (properties.expanded !== undefined) {
    aria['aria-expanded'] = String(Boolean(properties.expanded));
  }

  if (properties.selected !== undefined) {
    aria['aria-selected'] = String(Boolean(properties.selected));
  }

  if (properties.checked !== undefined) {
    aria['aria-checked'] = String(Boolean(properties.checked));
  }

  if (properties.disabled) {
    aria['aria-disabled'] = String(Boolean(properties.disabled));
  }

  if (properties.required) {
    aria['aria-required'] = String(Boolean(properties.required));
  }

  if (properties.hasPopup) {
    aria['aria-haspopup'] = String(Boolean(properties.hasPopup));
  }

  if (properties.controls) {
    aria['aria-controls'] = String(properties.controls);
  }

  if (properties.owns) {
    aria['aria-owns'] = String(properties.owns);
  }

  if (properties.pressed !== undefined) {
    aria['aria-pressed'] = String(Boolean(properties.pressed));
  }

  if (properties.valueNow !== undefined) {
    aria['aria-valuenow'] = String(properties.valueNow);
  }

  if (properties.valueMin !== undefined) {
    aria['aria-valuemin'] = String(properties.valueMin);
  }

  if (properties.valueMax !== undefined) {
    aria['aria-valuemax'] = String(properties.valueMax);
  }

  if (properties.valueText) {
    aria['aria-valuetext'] = String(properties.valueText);
  }

  if (properties.live) {
    aria['aria-live'] = String(properties.live);
  }

  if (properties.atomic !== undefined) {
    aria['aria-atomic'] = String(Boolean(properties.atomic));
  }

  if (properties.relevant) {
    aria['aria-relevant'] = String(properties.relevant);
  }

  if (properties.busy !== undefined) {
    aria['aria-busy'] = String(Boolean(properties.busy));
  }

  // Add element-specific attributes
  switch (elementType.toLowerCase()) {
    case 'button':
      aria['role'] = 'button';
      break;
    case 'link':
    case 'a':
      aria['role'] = 'link';
      break;
    case 'input':
      if (properties.type === 'checkbox') {
        aria['role'] = 'checkbox';
      } else if (properties.type === 'radio') {
        aria['role'] = 'radio';
      } else {
        aria['role'] = 'textbox';
      }
      break;
    case 'select':
      aria['role'] = 'listbox';
      break;
    case 'textarea':
      aria['role'] = 'textbox';
      aria['aria-multiline'] = 'true';
      break;
    case 'dialog':
    case 'modal':
      aria['role'] = 'dialog';
      aria['aria-modal'] = 'true';
      aria['aria-labelledby'] = String(properties.labelledBy || `${elementType}_title`);
      break;
    case 'alert':
      aria['role'] = 'alert';
      aria['aria-live'] = 'assertive';
      break;
    case 'status':
      aria['role'] = 'status';
      aria['aria-live'] = 'polite';
      break;
    case 'navigation':
    case 'nav':
      aria['role'] = 'navigation';
      aria['aria-label'] = properties.label ? String(properties.label) : 'Main navigation';
      break;
    case 'main':
      aria['role'] = 'main';
      break;
    case 'region':
    case 'section':
      aria['role'] = 'region';
      if (properties.label) {
        aria['aria-labelledby'] = String(properties.label);
      } else if (properties.title) {
        aria['aria-label'] = String(properties.title);
      }
      break;
    case 'form':
      aria['role'] = 'form';
      aria['aria-label'] = properties.label ? String(properties.label) : 'Form';
      break;
  }

  return aria;
}

/**
 * Get appropriate ARIA role for an element
 */
function getAriaRole(elementType: string, properties: Record<string, unknown>): string | undefined {
  const type = elementType.toLowerCase();

  // Native HTML elements with implicit roles
  const nativeRoles: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: 'textbox',
    textarea: 'textbox',
    select: 'listbox',
    img: 'img',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    nav: 'navigation',
    main: 'main',
    aside: 'complementary',
    header: 'banner',
    footer: 'contentinfo',
    form: 'form',
    table: 'table',
    thead: 'rowgroup',
    tbody: 'rowgroup',
    tfoot: 'rowgroup',
    tr: 'row',
    th: 'columnheader',
    td: 'cell'
  };

  if (nativeRoles[type]) {
    return nativeRoles[type];
  }

  // Check for type attribute on input
  if (type === 'input' && properties.type) {
    const inputType = String(properties.type).toLowerCase();
    const inputRoles: Record<string, string> = {
      button: 'button',
      checkbox: 'checkbox',
      radio: 'radio',
      search: 'searchbox',
      submit: 'button',
      reset: 'button',
      range: 'slider'
    };
    return inputRoles[inputType] || 'textbox';
  }

  return undefined;
}

/**
 * Generate alt text for an image or icon
 */
export function generateAltText(
  type: string,
  properties: Record<string, unknown> = {}
): string {
  const elements: string[] = [];

  // Add type description
  elements.push(type);

  // Add title if available
  if (properties.title) {
    elements.push(String(properties.title));
  }

  // Mark decorative elements
  if (properties.decorative === true) {
    elements.push('(decorative)');
  }

  // Add description if available
  if (properties.description) {
    elements.push(String(properties.description));
  }

  // Add context if available
  if (properties.context) {
    elements.push(`in ${properties.context}`);
  }

  // Add action if available
  if (properties.action) {
    elements.push(`which ${properties.action}`);
  }

  // Add label if available
  if (properties.label) {
    elements.push(String(properties.label));
  }

  // Add content if available
  if (properties.content) {
    elements.push(String(properties.content));
  }

  return elements.join(' ').trim();
}

/**
 * Generate a text description for screen readers
 */
export function generateScreenReaderText(
  elementType: string,
  properties: Record<string, unknown> = {}
): string {
  const type = elementType.toLowerCase();
  const elements: string[] = [];

  // Add element type description
  const typeDescriptions: Record<string, string> = {
    button: 'Button',
    link: 'Link',
    input: 'Input field',
    textarea: 'Text area',
    select: 'Dropdown',
    checkbox: 'Checkbox',
    radio: 'Radio button',
    dialog: 'Dialog',
    modal: 'Modal dialog',
    alert: 'Alert',
    navigation: 'Navigation',
    main: 'Main content',
    form: 'Form',
    table: 'Table',
    image: 'Image',
    icon: 'Icon'
  };

  const description = typeDescriptions[type] || elementType;
  elements.push(description);

  // Add label or title
  if (properties.label) {
    elements.push(`: ${properties.label}`);
  } else if (properties.title) {
    elements.push(`: ${properties.title}`);
  }

  // Add state information
  if (properties.disabled) {
    elements.push('(disabled)');
  }

  if (properties.required) {
    elements.push('(required)');
  }

  if (properties.expanded) {
    elements.push('(expanded)');
  }

  if (properties.selected) {
    elements.push('(selected)');
  }

  if (properties.checked) {
    elements.push('(checked)');
  }

  return elements.join(' ').trim();
}

/**
 * Validate an HTML string or template for accessibility issues
 */
export function validateAccessibility(
  html: string,
  config: Partial<AccessibilityConfig> = {}
): AccessibilityAuditResult {
  const mergedConfig = { ...defaultAccessibilityConfig, ...config };
  const issues: AccessibilityCheckResult[] = [];
  const warnings: AccessibilityCheckResult[] = [];
  const recommendations: string[] = [];

  // Run all accessibility checks
  issues.push(...checkImages(html, mergedConfig));
  issues.push(...checkLinks(html, mergedConfig));
  issues.push(...checkHeadings(html, mergedConfig));
  issues.push(...checkForms(html, mergedConfig));
  issues.push(...checkColors(html, mergedConfig));

  // Add warnings
  warnings.push(...checkLanguage(html, mergedConfig));
  warnings.push(...checkSkipLinks(html, mergedConfig));

  // Generate recommendations
  if (issues.length > 0) {
    recommendations.push('Add alt text to all images');
    recommendations.push('Ensure all links have descriptive text');
    recommendations.push('Use proper heading hierarchy');
    recommendations.push('Label all form elements');
  }

  // Determine compliance level
  let complianceLevel: 'A' | 'AA' | 'AAA' | 'None' = 'AA';
  
  if (issues.some(i => i.severity === 'A')) {
    complianceLevel = 'A';
  } else if (issues.some(i => i.severity === 'AA')) {
    complianceLevel = 'AA';
  } else if (issues.length === 0) {
    complianceLevel = 'AAA';
  } else {
    complianceLevel = 'None';
  }

  return {
    url: '',
    timestamp: new Date().toISOString(),
    totalChecks: issues.length + warnings.length,
    passedChecks: 0, // Will be calculated based on passing checks
    failedChecks: issues.length,
    complianceLevel,
    issues,
    warnings,
    recommendations
  };
}

/**
 * Check images for accessibility issues
 */
function checkImages(html: string, config: AccessibilityConfig): AccessibilityCheckResult[] {
  const issues: AccessibilityCheckResult[] = [];
  const imgRegex = /<img\s+[^>]*>/gi;
  
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const imgTag = match[0];
    
    // Check for alt attribute
    if (!imgTag.includes('alt=')) {
      issues.push({
        check: 'image-alt',
        passed: false,
        severity: 'A',
        description: 'Image is missing alt attribute',
        wcagCriteria: '1.1.1',
        suggestion: 'Add alt attribute with descriptive text',
        element: imgTag
      });
    }

    // Check for empty alt
    const altMatch = imgTag.match(/alt="([^"]*)"/i);
    if (altMatch && altMatch[1].trim() === '') {
      issues.push({
        check: 'image-alt-empty',
        passed: false,
        severity: 'A',
        description: 'Image has empty alt attribute',
        wcagCriteria: '1.1.1',
        suggestion: 'Provide meaningful alt text or use alt="" for decorative images',
        element: imgTag
      });
    }
  }

  return issues;
}

/**
 * Check links for accessibility issues
 */
function checkLinks(html: string, config: AccessibilityConfig): AccessibilityCheckResult[] {
  const issues: AccessibilityCheckResult[] = [];
  const linkRegex = /<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
  
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const content = match[2];
    
    // Check for empty link text
    if (content.trim() === '') {
      issues.push({
        check: 'link-empty',
        passed: false,
        severity: 'A',
        description: 'Link has empty text content',
        wcagCriteria: '4.1.2',
        suggestion: 'Add descriptive link text',
        element: `<a href="${href}">${content}</a>`
      });
    }

    // Check for click here type links
    const clickHerePatterns = ['click here', 'click this', 'more info', 'read more', 'here'];
    if (clickHerePatterns.some(pattern => content.toLowerCase().includes(pattern))) {
      issues.push({
        check: 'link-descriptive',
        passed: false,
        severity: 'A',
        description: 'Link text is not descriptive',
        wcagCriteria: '2.4.4',
        suggestion: 'Use descriptive link text that indicates the destination',
        element: `<a href="${href}">${content}</a>`
      });
    }
  }

  return issues;
}

/**
 * Check headings for accessibility issues
 */
function checkHeadings(html: string, config: AccessibilityConfig): AccessibilityCheckResult[] {
  const issues: AccessibilityCheckResult[] = [];
  const headingRegex = /<h([1-6])\s*[^>]*>(.*?)<\/h\1>/gi;
  
  const headings: Array<{ level: number; text: string }> = [];
  let match;
  
  while ((match = headingRegex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      text: match[2]
    });
  }

  // Check for missing h1
  if (headings.length > 0 && !headings.some(h => h.level === 1)) {
    issues.push({
      check: 'heading-h1',
      passed: false,
      severity: 'A',
      description: 'Page is missing h1 heading',
      wcagCriteria: '1.3.1',
      suggestion: 'Add a single h1 heading that describes the page content'
    });
  }

  // Check for multiple h1s
  if (headings.filter(h => h.level === 1).length > 1) {
    issues.push({
      check: 'heading-multiple-h1',
      passed: false,
      severity: 'A',
      description: 'Page has multiple h1 headings',
      wcagCriteria: '1.3.1',
      suggestion: 'Use only one h1 heading per page'
    });
  }

  // Check heading hierarchy
  for (let i = 1; i < headings.length; i++) {
    const prevLevel = headings[i - 1].level;
    const currLevel = headings[i].level;
    
    if (currLevel > prevLevel + 1) {
      issues.push({
        check: 'heading-hierarchy',
        passed: false,
        severity: 'A',
        description: `Heading hierarchy violated: h${currLevel} follows h${prevLevel}`,
        wcagCriteria: '1.3.1',
        suggestion: 'Do not skip heading levels (e.g., h3 should not directly follow h1)'
      });
    }
  }

  return issues;
}

/**
 * Check forms for accessibility issues
 */
function checkForms(html: string, config: AccessibilityConfig): AccessibilityCheckResult[] {
  const issues: AccessibilityCheckResult[] = [];
  const inputRegex = /<input\s+[^>]*>/gi;
  
  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    const inputTag = match[0];
    
    // Check for type attribute
    const typeMatch = inputTag.match(/type="([^"]*)"/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text';
    
    // Hidden inputs don't need labels
    if (type === 'hidden') {
      continue;
    }

    // Check for label association
    const idMatch = inputTag.match(/id="([^"]*)"/i);
    const id = idMatch ? idMatch[1] : null;
    
    // Check for aria-label or aria-labelledby
    const hasAriaLabel = inputTag.includes('aria-label=');
    const hasAriaLabelledBy = inputTag.includes('aria-labelledby=');
    
    if (!hasAriaLabel && !hasAriaLabelledBy && !id) {
      // Check if there's a label element with for attribute
      const labelRegex = new RegExp(`<label[^>]*for="${id}"[^>]*>.*?</label>`, 'i');
      if (!html.match(labelRegex)) {
        issues.push({
          check: 'input-label',
          passed: false,
          severity: 'A',
          description: `Input ${type} is missing label`,
          wcagCriteria: '1.3.1',
          suggestion: 'Add a label element with matching for attribute or use aria-label',
          element: inputTag
        });
      }
    }

    // Check for required inputs with indication
    if (inputTag.includes('required')) {
      if (!hasAriaLabel && !inputTag.includes('aria-required="true"')) {
        issues.push({
          check: 'input-required-indicator',
          passed: false,
          severity: 'A',
          description: 'Required input is missing required indicator',
          wcagCriteria: '3.3.2',
          suggestion: 'Add aria-required="true" or visual indicator for required fields',
          element: inputTag
        });
      }
    }
  }

  return issues;
}

/**
 * Check colors for contrast issues
 */
function checkColors(html: string, config: AccessibilityConfig): AccessibilityCheckResult[] {
  const issues: AccessibilityCheckResult[] = [];
  const styleRegex = /style="[^"]*"|style='[^']*'/gi;
  
  let match;
  while ((match = styleRegex.exec(html)) !== null) {
    const style = match[0];
    const colors = extractColors(style);
    
    for (const color of colors) {
      // Check contrast with white
      const contrastWithWhite = calculateContrast(color, '#FFFFFF');
      if (contrastWithWhite < config.colorContrast.minimumRatio) {
        issues.push({
          check: 'color-contrast-white',
          passed: false,
          severity: 'AA',
          description: `Color ${color} has insufficient contrast with white (${contrastWithWhite.toFixed(2)})`,
          wcagCriteria: '1.4.3',
          suggestion: `Use a color with at least ${config.colorContrast.minimumRatio} contrast ratio`,
          element: style
        });
      }

      // Check contrast with black
      const contrastWithBlack = calculateContrast(color, '#000000');
      if (contrastWithBlack < config.colorContrast.minimumRatio) {
        issues.push({
          check: 'color-contrast-black',
          passed: false,
          severity: 'AA',
          description: `Color ${color} has insufficient contrast with black (${contrastWithBlack.toFixed(2)})`,
          wcagCriteria: '1.4.3',
          suggestion: `Use a color with at least ${config.colorContrast.minimumRatio} contrast ratio`,
          element: style
        });
      }
    }
  }

  return issues;
}

/**
 * Check for language attribute
 */
function checkLanguage(html: string, config: AccessibilityConfig): AccessibilityCheckResult[] {
  const warnings: AccessibilityCheckResult[] = [];
  const htmlTagMatch = html.match(/<html[^>]*>/i);
  
  if (htmlTagMatch && !htmlTagMatch[0].includes('lang=')) {
    warnings.push({
      check: 'html-lang',
      passed: false,
      severity: 'A',
      description: 'HTML element is missing lang attribute',
      wcagCriteria: '3.1.1',
      suggestion: 'Add lang attribute to html element (e.g., lang="en")'
    });
  }

  return warnings;
}

/**
 * Check for skip links
 */
function checkSkipLinks(html: string, config: AccessibilityConfig): AccessibilityCheckResult[] {
  const warnings: AccessibilityCheckResult[] = [];
  
  // Check for skip to main content link
  if (!html.includes('skip to main') && !html.includes('skip to content')) {
    warnings.push({
      check: 'skip-link',
      passed: false,
      severity: 'A',
      description: 'Missing skip link for keyboard users',
      wcagCriteria: '2.4.1',
      suggestion: 'Add a skip link at the beginning of the page'
    });
  }

  return warnings;
}

/**
 * Middleware to add accessibility metadata to API responses
 */
export function accessibilityMetadataMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add accessibility metadata to successful JSON responses
    const originalJson = res.json;
    
    res.json = function(data: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Add accessibility metadata to the response
        const metadata: AccessibilityMetadata = {
          conformanceLevel: 'AA',
          accessibilityFeatures: [
            'semantic-html',
            'aria-attributes',
            'keyboard-navigation',
            'color-contrast',
            'screen-reader-support'
          ],
          language: 'en-US',
          skipLinks: [
            { id: 'skip-main', text: 'Skip to main content' },
            { id: 'skip-nav', text: 'Skip to navigation' }
          ],
          focusOrder: [],
          keyboardNavigation: true
        };

        // If data is an object, add metadata
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
          const responseData = data as Record<string, unknown>;
          responseData.accessibility = metadata;
        }
      }

      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Generate a comprehensive accessibility statement
 */
export function generateAccessibilityStatement(
  productName: string,
  version: string,
  conformanceLevel: 'A' | 'AA' | 'AAA' = 'AA'
): string {
  return `
# Accessibility Statement for ${productName}

## Our Commitment

We are committed to ensuring that ${productName} is accessible to the widest possible audience, 
regardless of ability. We actively work to increase the accessibility and usability of our 
product, and in doing so adhere to many of the available standards and guidelines.

## Web Content Accessibility Guidelines (WCAG) 2.1

This product aims to support the Web Content Accessibility Guidelines (WCAG) 2.1 at the 
${conformanceLevel} level. These guidelines explain how to make web content more accessible for 
people with disabilities, and user friendly for everyone.

The guidelines have three levels of accessibility (A, AA and AAA). We've chosen Level ${conformanceLevel} 
as the target for ${productName} version ${version}.

## Accessibility Features

${productName} includes the following accessibility features:

- **Keyboard Navigation**: Full keyboard support for all functionality
- **Screen Reader Support**: Proper ARIA attributes and semantic HTML
- **Color Contrast**: Minimum contrast ratio of ${defaultAccessibilityConfig.colorContrast.minimumRatio}:1
- **Focus Management**: Visible focus indicators and logical focus order
- **Alternative Text**: Descriptive alt text for all images and icons
- **Form Accessibility**: Proper labels and instructions for all form elements
- **Error Prevention**: Clear error messages and suggestions
- **Language Support**: Proper language attributes and localization support

## Supported Assistive Technologies

- JAWS screen reader
- NVDA screen reader
- VoiceOver (macOS and iOS)
- TalkBack (Android)
- Keyboard-only navigation
- High contrast modes
- Screen magnification software

## Known Limitations

Despite our best efforts to ensure accessibility of ${productName}, there may be some limitations:

- Some third-party integrations may have accessibility issues beyond our control
- PDF documents may not be fully accessible
- Some legacy content may not meet current accessibility standards

## Feedback

We welcome your feedback on the accessibility of ${productName}. If you encounter accessibility 
barriers, please contact us at: accessibility@front-desk-ai.com

We will respond to your feedback within 3 business days.

## Technical Specifications

- WCAG 2.1 ${conformanceLevel} compliance
- WAI-ARIA 1.2 support
- Section 508 (US) compliance
- EN 301 549 (EU) compliance

## Last Updated

This accessibility statement was last updated on ${new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})}.
`;
}

