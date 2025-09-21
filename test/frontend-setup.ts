import { beforeEach, afterEach, vi } from 'vitest';

// Frontend test setup - DOM utilities and mock setup
beforeEach(() => {
  // Clean up DOM before each test
  document.body.innerHTML = '';
  
  // Reset location
  delete (window as any).location;
  (window as any).location = {
    href: 'http://localhost:3100',
    search: '',
    pathname: '/'
  };
  
  // Reset localStorage
  localStorage.clear();
  
  // Mock console methods to reduce noise in tests
  global.console = {
    ...console,
    debug: vi.fn(),
    log: vi.fn()
  };
});

afterEach(() => {
  // Clean up after each test
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

// Global test utilities
global.createMockElement = (tag: string, attributes: Record<string, string> = {}) => {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'textContent') {
      element.textContent = value;
    } else {
      element.setAttribute(key, value);
    }
  });
  return element;
};

// Extend the global namespace for our test utilities
declare global {
  var createMockElement: (tag: string, attributes?: Record<string, string>) => HTMLElement;
}