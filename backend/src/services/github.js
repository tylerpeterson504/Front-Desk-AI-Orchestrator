const DEFAULT_TIMEOUT_MS = 15_000;

function isConfigured() {
  return Boolean(String(process.env.GITHUB_TOKEN || '').trim());
}

async function request(path, options = {}) {
  if (!isConfigured()) {
    const error = new Error('GitHub is not configured');
    error.code = 'GITHUB_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(`GitHub request failed with status ${response.status}`);
      error.code = 'GITHUB_REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { isConfigured, request };
