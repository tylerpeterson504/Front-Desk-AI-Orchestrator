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
    sendMessage: jest.fn()
  },
  sidePanel: {
    open: jest.fn()
  }
};

// Mock fetch for API calls
global.fetch = jest.fn();
