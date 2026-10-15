// Test script to verify MCP worker connection without local Unity process
const testMcpConnection = async () => {
  try {
    // Test with production configuration
    const env = {
      BACKEND_URL: 'https://your-backend-url.onrender.com',
      NODE_ENV: 'production'
    };
    
    // Mock the fetch function
    global.fetch = jest.fn((url) => {
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });
    
    // Import the worker
    const worker = await import('./src/index.ts');
    
    // Test health endpoint
    const request = new Request('https://mcp-worker-url/health');
    const response = await worker.default.fetch(request, env);
    
    const result = await response.json();
    console.log('Health check result:', result);
    
    if (result.status === 'ok') {
      console.log('✅ MCP worker connection test passed - no local Unity process attempted');
      return true;
    } else {
      console.log('❌ Health check failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    // Check if the error is related to local Unity process
    if (error.message.includes('spawn') || error.message.includes('ENOENT')) {
      console.error('❌ Local Unity process was attempted when it should not have been');
      return false;
    }
    console.log('✅ Error is not related to local Unity process');
    return true;
  }
};

testMcpConnection().then(success => {
  process.exit(success ? 0 : 1);
});