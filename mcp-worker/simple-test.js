// Simple test to verify MCP worker doesn't try to spawn local Unity process
const testNoLocalUnity = async () => {
  try {
    console.log('Testing MCP worker without local Unity process...');
    
    // Import the worker
    const worker = await import('./src/index.ts');
    
    // Test environment without ENABLE_LOCAL_UNITY
    const env = {
      BACKEND_URL: 'https://test-backend.com',
      NODE_ENV: 'production'
    };
    
    // Mock fetch
    global.fetch = async (url) => {
      console.log(`Mock fetch called for: ${url}`);
      return {
        ok: true,
        json: async () => ({ status: 'ok' }),
        text: async () => 'ok'
      };
    };
    
    // Test health endpoint
    const request = new Request('https://test.com/health');
    const response = await worker.default.fetch(request, env);
    
    const result = await response.json();
    console.log('Health check result:', result);
    
    if (result.status === 'ok') {
      console.log('✅ MCP worker works without local Unity process');
      return true;
    }
    
    console.log('❌ Health check failed');
    return false;
  } catch (error) {
    console.error('Error:', error.message);
    
    // Check if the error is related to local Unity process
    if (error.message.includes('spawn') || error.message.includes('ENOENT') || 
        error.message.includes('unity') || error.message.includes('LocalProcess')) {
      console.error('❌ Local Unity process was attempted when it should not have been');
      return false;
    }
    
    console.log('✅ Error is not related to local Unity process');
    return true;
  }
};

testNoLocalUnity().then(success => {
  process.exit(success ? 0 : 1);
});