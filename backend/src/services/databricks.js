const DEFAULT_TIMEOUT_MS = 15_000;

function getConfig() {
  const host = String(process.env.DATABRICKS_HOST || '').trim().replace(/\/$/, '');
  const token = String(process.env.DATABRICKS_TOKEN || '').trim();
  return { host, token };
}

function isConfigured() {
  const { host, token } = getConfig();
  return Boolean(host && token);
}

async function executeSql(statement, options = {}) {
  if (!isConfigured()) {
    const error = new Error('Databricks is not configured');
    error.code = 'DATABRICKS_NOT_CONFIGURED';
    throw error;
  }
  if (typeof statement !== 'string' || !statement.trim() || statement.length > 100_000) {
    const error = new Error('A valid SQL statement is required');
    error.code = 'INVALID_SQL_STATEMENT';
    throw error;
  }

  const { host, token } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${host}/api/2.0/sql/statements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        statement: statement.trim(),
        warehouse_id: options.warehouseId || process.env.DATABRICKS_WAREHOUSE_ID,
        wait_timeout: options.waitTimeout || '10s',
        disposition: 'INLINE'
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(`Databricks request failed with status ${response.status}`);
      error.code = 'DATABRICKS_REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { executeSql, isConfigured };
