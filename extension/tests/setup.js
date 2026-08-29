// Setup file for extension tests
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    }
  },
  runtime: {
    onMessage: {
      addListener: jest.fn()
    },
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
