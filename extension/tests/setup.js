// Setup file for extension tests
// Alias jest to vi for Jest compatibility in Vitest
import { vi } from 'vitest';
global.jest = vi;

// Shim for jest.isolateModules — Vitest does not provide this method.
// Jest's isolateModules creates a fresh module registry for the callback;
// resetModules + callback achieves the same isolation effect.
if (typeof global.jest.isolateModules !== 'function') {
  global.jest.isolateModules = (callback) => {
    vi.resetModules();
    callback();
  };
}

global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    },
    onChanged: {
      addListener: jest.fn()
    }
  },
  permissions: {
    request: jest.fn(),
    contains: jest.fn()
  },
  runtime: {
    onMessage: {
      addListener: jest.fn(),
      hasListeners: false
    },
    onInstalled: {
      addListener: jest.fn()
    },
    onSuspend: {
      addListener: jest.fn()
    },
    lastError: null,
    sendMessage: jest.fn().mockReturnValue(Promise.resolve())
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn()
  },
  windows: {
    getCurrent: jest.fn()
  },
  sidePanel: {
    open: jest.fn()
  }
};

// Mock fetch for API calls
global.fetch = jest.fn();

// jsdom does not implement navigator.clipboard; shim it for sidepanel tests.
global.navigator.clipboard = global.navigator.clipboard || {};
