/**
 * Accessibility Middleware Tests
 * Comprehensive test suite for WCAG 2.1 AA compliance middleware
 */

import {
  accessibilityHeaders,
  languageHeaders,
  skipLinksMiddleware,
  keyboardNavigationMiddleware,
  colorContrastValidator,
  generateAriaAttributes,
  generateAltText,
  calculateContrast,
  AccessibilityError,
  wcagGuidelines,
  ariaRoles,
  AccessibilityConfig,
  AccessibilityCheckResult,
  AccessibilityAuditResult
} from '../src/middleware/accessibility';

import type { Request, Response, NextFunction } from 'express';

// Mock express types
const mockRequest = {} as Request;
const mockNext: NextFunction = jest.fn();

describe('Accessibility Middleware', () => {
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResponse = {
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      locals: {},
      json: jest.fn()
    };
  });

  describe('accessibilityHeaders', () => {
    it('should add accessibility conformance header', () => {
      const middleware = accessibilityHeaders();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Accessibility-Conformance',
        'WCAG 2.1 AA'
      );
    });

    it('should add accessibility language header', () => {
      const middleware = accessibilityHeaders();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Accessibility-Language',
        'en-US'
      );
    });

    it('should add Vary header for Accept and Accept-Language', () => {
      const middleware = accessibilityHeaders();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Vary',
        'Accept, Accept-Language'
      );
    });

    it('should modify CSP header to allow assistive technologies', () => {
      mockResponse.getHeader = jest.fn((key: string) => {
        if (key === 'Content-Security-Policy') {
          return 'default-src \'self\'';
        }
        return undefined;
      });

      const middleware = accessibilityHeaders();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining('script-src')
      );
    });

    it('should skip processing when addAccessibilityHeaders is false', () => {
      const middleware = accessibilityHeaders({ addAccessibilityHeaders: false });
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next function', () => {
      const middleware = accessibilityHeaders();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('languageHeaders', () => {
    it('should set Content-Language header', () => {
      const middleware = languageHeaders('fr-FR');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Language',
        'fr-FR'
      );
    });

    it('should add Accept-Language to Vary header when not present', () => {
      mockResponse.getHeader = jest.fn(() => undefined);

      const middleware = languageHeaders();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Vary',
        'Accept-Language'
      );
    });

    it('should append Accept-Language to existing Vary header', () => {
      mockResponse.getHeader = jest.fn((key: string) => {
        if (key === 'Vary') {
          return 'Accept';
        }
        return undefined;
      });

      const middleware = languageHeaders();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Vary',
        'Accept, Accept-Language'
      );
    });

    it('should handle array Vary header', () => {
      mockResponse.getHeader = jest.fn((key: string) => {
        if (key === 'Vary') {
          return ['Accept'];
        }
        return undefined;
      });

      const middleware = languageHeaders();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Vary',
        ['Accept', 'Accept-Language']
      );
    });
  });

  describe('skipLinksMiddleware', () => {
    it('should add skip links to response locals', () => {
      const middleware = skipLinksMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect((mockResponse as any).locals.skipLinks).toBeDefined();
      expect((mockResponse as any).locals.skipLinks).toHaveLength(3);
    });

    it('should include main content skip link', () => {
      const middleware = skipLinksMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const skipLinks = (mockResponse as any).locals.skipLinks;
      expect(skipLinks).toContainEqual({
        href: '#main',
        text: 'Skip to main content'
      });
    });

    it('should include navigation skip link', () => {
      const middleware = skipLinksMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const skipLinks = (mockResponse as any).locals.skipLinks;
      expect(skipLinks).toContainEqual({
        href: '#navigation',
        text: 'Skip to navigation'
      });
    });

    it('should include search skip link', () => {
      const middleware = skipLinksMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const skipLinks = (mockResponse as any).locals.skipLinks;
      expect(skipLinks).toContainEqual({
        href: '#search',
        text: 'Skip to search'
      });
    });
  });

  describe('keyboardNavigationMiddleware', () => {
    it('should set keyboard navigation flag', () => {
      const middleware = keyboardNavigationMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect((mockResponse as any).locals.keyboardNavigation).toBe(true);
    });

    it('should add keyboard shortcuts metadata', () => {
      const middleware = keyboardNavigationMiddleware();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const shortcuts = (mockResponse as any).locals.keyboardShortcuts;
      expect(shortcuts).toBeDefined();
      expect(shortcuts['escape']).toBe('Close dialogs/modals');
      expect(shortcuts['tab']).toBe('Navigate through focusable elements');
      expect(shortcuts['enter']).toBe('Activate buttons and links');
    });
  });

  describe('colorContrastValidator', () => {
    it('should return valid for non-object data', () => {
      const result = colorContrastValidator(null);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should return valid for data without color properties', () => {
      const result = colorContrastValidator({ name: 'test', value: 123 });
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should validate sufficient contrast colors', () => {
      // Black on white has maximum contrast (21:1)
      const result = colorContrastValidator({ backgroundColor: '#FFFFFF', color: '#000000' });
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should flag insufficient contrast colors', () => {
      // Light gray on white has very low contrast
      const result = colorContrastValidator({ backgroundColor: '#FFFFFF', color: '#EEEEEE' });
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('calculateContrast', () => {
    it('should calculate contrast between white and black', () => {
      const contrast = calculateContrast('#FFFFFF', '#000000');
      expect(contrast).toBeCloseTo(21, 0); // Maximum contrast is ~21:1
    });

    it('should calculate contrast between identical colors', () => {
      const contrast = calculateContrast('#FFFFFF', '#FFFFFF');
      expect(contrast).toBe(1); // Same color = 1:1 contrast
    });

    it('should handle hex color variations', () => {
      const contrast = calculateContrast('#fff', '#000');
      expect(contrast).toBeGreaterThan(1);
    });

    it('should handle rgb colors', () => {
      const contrast = calculateContrast('rgb(255,255,255)', 'rgb(0,0,0)');
      expect(contrast).toBeCloseTo(21, 0);
    });

    it('should handle named colors', () => {
      const contrast = calculateContrast('white', 'black');
      expect(contrast).toBeCloseTo(21, 0);
    });

    it('should return 1 for unparseable colors', () => {
      const contrast = calculateContrast('invalid', 'colors');
      expect(contrast).toBe(1);
    });
  });

  describe('generateAriaAttributes', () => {
    it('should generate role attribute for button', () => {
      const aria = generateAriaAttributes('button');
      expect(aria.role).toBe('button');
    });

    it('should generate role attribute for navigation', () => {
      const aria = generateAriaAttributes('nav');
      expect(aria.role).toBe('navigation');
    });

    it('should generate aria-label for labeled elements', () => {
      const aria = generateAriaAttributes('button', { label: 'Submit Form' });
      expect(aria['aria-label']).toBe('Submit Form');
    });

    it('should generate aria-hidden for hidden elements', () => {
      const aria = generateAriaAttributes('div', { hidden: true });
      expect(aria['aria-hidden']).toBe('true');
    });

    it('should generate aria-expanded for expandable elements', () => {
      const aria = generateAriaAttributes('button', { expanded: true });
      expect(aria['aria-expanded']).toBe('true');
    });

    it('should generate aria-selected for selected elements', () => {
      const aria = generateAriaAttributes('option', { selected: true });
      expect(aria['aria-selected']).toBe('true');
    });

    it('should generate aria-checked for checkbox', () => {
      const aria = generateAriaAttributes('input', { type: 'checkbox', checked: true });
      expect(aria['aria-checked']).toBe('true');
      expect(aria.role).toBe('checkbox');
    });

    it('should generate aria-checked for radio', () => {
      const aria = generateAriaAttributes('input', { type: 'radio', checked: false });
      expect(aria['aria-checked']).toBe('false');
      expect(aria.role).toBe('radio');
    });

    it('should generate aria-disabled for disabled elements', () => {
      const aria = generateAriaAttributes('button', { disabled: true });
      expect(aria['aria-disabled']).toBe('true');
    });

    it('should generate aria-required for required elements', () => {
      const aria = generateAriaAttributes('input', { required: true });
      expect(aria['aria-required']).toBe('true');
    });

    it('should generate aria-haspopup for elements with popup', () => {
      const aria = generateAriaAttributes('button', { hasPopup: true });
      expect(aria['aria-haspopup']).toBe('true');
    });

    it('should generate aria-controls for controlling elements', () => {
      const aria = generateAriaAttributes('button', { controls: 'menu-id' });
      expect(aria['aria-controls']).toBe('menu-id');
    });

    it('should generate aria-pressed for toggle buttons', () => {
      const aria = generateAriaAttributes('button', { pressed: true });
      expect(aria['aria-pressed']).toBe('true');
    });

    it('should generate value attributes for progress bars', () => {
      const aria = generateAriaAttributes('progress', {
        valueNow: 50,
        valueMin: 0,
        valueMax: 100,
        valueText: '50 percent'
      });
      expect(aria['aria-valuenow']).toBe('50');
      expect(aria['aria-valuemin']).toBe('0');
      expect(aria['aria-valuemax']).toBe('100');
      expect(aria['aria-valuetext']).toBe('50 percent');
    });

    it('should generate live region attributes', () => {
      const aria = generateAriaAttributes('div', {
        live: 'polite',
        atomic: true,
        relevant: 'additions'
      });
      expect(aria['aria-live']).toBe('polite');
      expect(aria['aria-atomic']).toBe('true');
      expect(aria['aria-relevant']).toBe('additions');
    });

    it('should generate busy attribute', () => {
      const aria = generateAriaAttributes('div', { busy: true });
      expect(aria['aria-busy']).toBe('true');
    });

    it('should handle dialog elements', () => {
      const aria = generateAriaAttributes('dialog', { label: 'Modal Title', labelledBy: 'title-id' });
      expect(aria.role).toBe('dialog');
      expect(aria['aria-modal']).toBe('true');
      expect(aria['aria-labelledby']).toBe('title-id');
    });

    it('should handle alert elements', () => {
      const aria = generateAriaAttributes('alert', { live: 'assertive' });
      expect(aria.role).toBe('alert');
      expect(aria['aria-live']).toBe('assertive');
    });

    it('should handle status elements', () => {
      const aria = generateAriaAttributes('status', { live: 'polite' });
      expect(aria.role).toBe('status');
      expect(aria['aria-live']).toBe('polite');
    });

    it('should handle form elements', () => {
      const aria = generateAriaAttributes('form', { label: 'Contact Form' });
      expect(aria.role).toBe('form');
      expect(aria['aria-label']).toBe('Contact Form');
    });

    it('should handle textarea elements', () => {
      const aria = generateAriaAttributes('textarea');
      expect(aria.role).toBe('textbox');
      expect(aria['aria-multiline']).toBe('true');
    });

    it('should handle select elements', () => {
      const aria = generateAriaAttributes('select');
      expect(aria.role).toBe('listbox');
    });

    it('should handle table elements', () => {
      const aria = generateAriaAttributes('table');
      expect(aria.role).toBe('table');
    });

    it('should handle img elements', () => {
      const aria = generateAriaAttributes('img', { label: 'Image description' });
      expect(aria.role).toBe('img');
      expect(aria['aria-label']).toBe('Image description');
    });
  });

  describe('generateAltText', () => {
    it('should generate alt text with type only', () => {
      const altText = generateAltText('image');
      expect(altText).toBe('image');
    });

    it('should generate alt text with type and title', () => {
      const altText = generateAltText('image', { title: 'Logo' });
      expect(altText).toBe('image Logo');
    });

    it('should generate alt text with type, title, and description', () => {
      const altText = generateAltText('image', {
        title: 'Logo',
        description: 'Company logo with colorful design'
      });
      expect(altText).toBe('image Logo Company logo with colorful design');
    });

    it('should generate alt text with context', () => {
      const altText = generateAltText('button', {
        title: 'Submit',
        context: 'form'
      });
      expect(altText).toBe('button Submit in form');
    });

    it('should generate alt text with action', () => {
      const altText = generateAltText('button', {
        title: 'Close',
        action: 'closes the dialog'
      });
      expect(altText).toBe('button Close which closes the dialog');
    });

    it('should generate alt text for icons', () => {
      const altText = generateAltText('icon', {
        title: 'Settings',
        type: 'gear'
      });
      expect(altText).toContain('icon');
      expect(altText).toContain('Settings');
    });

    it('should generate alt text for decorative images', () => {
      const altText = generateAltText('image', {
        title: 'Decorative',
        decorative: true
      });
      expect(altText).toContain('Decorative');
      expect(altText).toContain('decorative');
    });
  });

  describe('AccessibilityError', () => {
    it('should create error with all properties', () => {
      const error = new AccessibilityError(
        'Test error message',
        'missing-alt-text',
        '1.1.1',
        'A',
        'img#logo',
        'Add alt attribute'
      );

      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('AccessibilityError');
      expect(error.issue).toBe('missing-alt-text');
      expect(error.wcagCriteria).toBe('1.1.1');
      expect(error.severity).toBe('A');
      expect(error.element).toBe('img#logo');
      expect(error.suggestion).toBe('Add alt attribute');
    });

    it('should handle optional element and suggestion', () => {
      const error = new AccessibilityError(
        'Test error message',
        'missing-alt-text',
        '1.1.1',
        'A'
      );

      expect(error.issue).toBe('missing-alt-text');
      expect(error.wcagCriteria).toBe('1.1.1');
      expect(error.severity).toBe('A');
      expect(error.element).toBeUndefined();
      expect(error.suggestion).toBeUndefined();
    });
  });

  describe('wcagGuidelines', () => {
    it('should contain all WCAG 2.1 guidelines', () => {
      expect(Object.keys(wcagGuidelines).length).toBeGreaterThan(40);
    });

    it('should have correct structure for each guideline', () => {
      const firstGuideline = wcagGuidelines['1.1.1'];
      expect(firstGuideline).toHaveProperty('description');
      expect(firstGuideline).toHaveProperty('level');
      expect(firstGuideline).toHaveProperty('category');
    });

    it('should include Perceivable category guidelines', () => {
      const perceivableGuidelines = Object.entries(wcagGuidelines)
        .filter(([_, guideline]) => guideline.category === 'Perceivable');
      expect(perceivableGuidelines.length).toBeGreaterThan(10);
    });

    it('should include Operable category guidelines', () => {
      const operableGuidelines = Object.entries(wcagGuidelines)
        .filter(([_, guideline]) => guideline.category === 'Operable');
      expect(operableGuidelines.length).toBeGreaterThan(10);
    });

    it('should include Understandable category guidelines', () => {
      const understandableGuidelines = Object.entries(wcagGuidelines)
        .filter(([_, guideline]) => guideline.category === 'Understandable');
      expect(understandableGuidelines.length).toBeGreaterThan(10);
    });

    it('should include Robust category guidelines', () => {
      const robustGuidelines = Object.entries(wcagGuidelines)
        .filter(([_, guideline]) => guideline.category === 'Robust');
      expect(robustGuidelines.length).toBeGreaterThan(0);
    });

    it('should have different severity levels', () => {
      const levels = ['A', 'AA', 'AAA'];
      for (const level of levels) {
        const guidelines = Object.entries(wcagGuidelines)
          .filter(([_, guideline]) => guideline.level === level);
        expect(guidelines.length).toBeGreaterThan(0);
      }
    });
  });

  describe('ariaRoles', () => {
    it('should contain all standard ARIA roles', () => {
      expect(Object.keys(ariaRoles).length).toBeGreaterThan(50);
    });

    it('should include basic roles', () => {
      expect(ariaRoles.button).toBe('button');
      expect(ariaRoles.link).toBe('link');
      expect(ariaRoles.navigation).toBe('navigation');
      expect(ariaRoles.main).toBe('main');
    });

    it('should include form-related roles', () => {
      expect(ariaRoles.checkbox).toBe('checkbox');
      expect(ariaRoles.radio).toBe('radio');
      expect(ariaRoles.textbox).toBe('textbox');
      expect(ariaRoles.form).toBe('form');
    });

    it('should include composite widget roles', () => {
      expect(ariaRoles.dialog).toBe('dialog');
      expect(ariaRoles.listbox).toBe('listbox');
      expect(ariaRoles.menu).toBe('menu');
      expect(ariaRoles.tab).toBe('tab');
    });

    it('should include live region roles', () => {
      expect(ariaRoles.alert).toBe('alert');
      expect(ariaRoles.status).toBe('status');
      expect(ariaRoles.timer).toBe('timer');
    });

    it('should include structural roles', () => {
      expect(ariaRoles.article).toBe('article');
      expect(ariaRoles.section).toBe('section');
      expect(ariaRoles.region).toBe('region');
    });

    it('should include landmark roles', () => {
      expect(ariaRoles.banner).toBe('banner');
      expect(ariaRoles.contentinfo).toBe('contentinfo');
      expect(ariaRoles.complementary).toBe('complementary');
    });
  });
});

describe('Accessibility Configuration', () => {
  describe('defaultAccessibilityConfig', () => {
    it('should have correct default values', () => {
      const config = {
        enabled: true,
        enforceWCAG: process.env.NODE_ENV === 'production',
        addAccessibilityHeaders: true,
        generateAltText: true,
        enableSkipLinks: true,
        focusManagement: true,
        colorContrast: {
          minimumRatio: 4.5,
          enforce: process.env.NODE_ENV === 'production'
        },
        screenReader: {
          enabled: true,
          liveRegions: true
        }
      };

      expect(config.enabled).toBe(true);
      expect(config.addAccessibilityHeaders).toBe(true);
      expect(config.generateAltText).toBe(true);
      expect(config.colorContrast.minimumRatio).toBe(4.5);
    });
  });
});

describe('Accessibility Types', () => {
  describe('AccessibilityConfig', () => {
    it('should have all required properties', () => {
      const config: AccessibilityConfig = {
        enabled: true,
        enforceWCAG: true,
        addAccessibilityHeaders: true,
        generateAltText: true,
        enableSkipLinks: true,
        focusManagement: true,
        colorContrast: {
          minimumRatio: 4.5,
          enforce: true
        },
        screenReader: {
          enabled: true,
          liveRegions: true
        }
      };

      expect(config).toBeDefined();
      expect(config.enabled).toBe(true);
    });
  });

  describe('AccessibilityCheckResult', () => {
    it('should create valid check result', () => {
      const result: AccessibilityCheckResult = {
        check: 'color-contrast',
        passed: true,
        severity: 'AA',
        description: 'Color contrast meets WCAG 2.1 AA requirements',
        suggestion: 'Consider improving contrast for better accessibility',
        element: '#button-1',
        wcagCriteria: '1.4.3'
      };

      expect(result.check).toBe('color-contrast');
      expect(result.passed).toBe(true);
      expect(result.severity).toBe('AA');
    });
  });

  describe('AccessibilityAuditResult', () => {
    it('should create valid audit result', () => {
      const result: AccessibilityAuditResult = {
        url: 'https://example.com',
        timestamp: new Date().toISOString(),
        totalChecks: 25,
        passedChecks: 20,
        failedChecks: 5,
        complianceLevel: 'AA',
        issues: [],
        warnings: [],
        recommendations: ['Improve color contrast']
      };

      expect(result.url).toBe('https://example.com');
      expect(result.complianceLevel).toBe('AA');
      expect(result.totalChecks).toBe(25);
    });
  });
});
