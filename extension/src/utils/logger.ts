// Centralized logging utility for extension content scripts
// Provides structured logging with configurable debug mode

/**
 * Logger configuration
 */
export interface LoggerConfig {
  debug: boolean;
  prefix: string;
}

/**
 * Create a logger instance with configurable prefix and debug mode
 */
export function createLogger(prefix: string): {
  log: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  setDebug: (enabled: boolean) => void;
} {
  let debug = false;

  function setDebug(enabled: boolean): void {
    debug = enabled;
  }

  function formatMessage(prefix: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${prefix}] ${message}`;
  }

  function formatWithData(prefix: string, message: string, data: unknown): string {
    try {
      const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
      return `[${new Date().toISOString()}] [${prefix}] ${message} ${dataStr}`;
    } catch {
      return `[${new Date().toISOString()}] [${prefix}] ${message} [unable to stringify data]`;
    }
  }

  function log(message: string, data?: unknown): void {
    if (!debug) return;
    const formatted = data !== undefined ? formatWithData(prefix, message, data) : formatMessage(prefix, message);
    console.log(formatted);
  }

  function warn(message: string, data?: unknown): void {
    if (!debug) return;
    const formatted = data !== undefined ? formatWithData(prefix, message, data) : formatMessage(prefix, message);
    console.warn(formatted);
  }

  function error(message: string, data?: unknown): void {
    // Always log errors, even when debug is off
    const formatted = data !== undefined ? formatWithData(prefix, message, data) : formatMessage(prefix, message);
    console.error(formatted);
  }

  return {
    log,
    warn,
    error,
    setDebug
  };
}

/**
 * Global logger instance for content scripts
 * Debug mode can be enabled via chrome.storage.local.set({ 'fdao-debug': true })
 */
let globalDebug = false;

function checkDebugFlag(): void {
  try {
    if (chrome.storage.local.get.length > 1) {
      chrome.storage.local.get(['fdao-debug'], (result: Record<string, unknown>) => {
        globalDebug = result['fdao-debug'] === true;
      });
      return;
    }

    const result = chrome.storage.local.get(['fdao-debug']);
    if (result && typeof (result as Promise<Record<string, unknown>>).then === 'function') {
      (result as Promise<Record<string, unknown>>).then((r) => {
        globalDebug = r['fdao-debug'] === true;
      }).catch(() => {});
      return;
    }
    if (result && typeof result === 'object') {
      globalDebug = (result as Record<string, unknown>)['fdao-debug'] === true;
    }
  } catch {
    // Ignore errors
  }
}

// Initialize debug flag check
checkDebugFlag();

// Also check periodically in case it changes
setInterval(checkDebugFlag, 60000);

/**
 * Global content script logger
 */
export const logger = createLogger('FDAO');

/**
 * Initialize debug mode for the global logger
 */
export function initDebugMode(loggerInstance: ReturnType<typeof createLogger>): void {
  checkDebugFlag();
  loggerInstance.setDebug(globalDebug);
  
  // Update periodically
  setInterval(() => {
    checkDebugFlag();
    loggerInstance.setDebug(globalDebug);
  }, 60000);
}

/**
 * Lightweight logging functions that check the global debug flag
 */
export function log(message: string, data?: unknown): void {
  if (!globalDebug) return;
  const formatted = data !== undefined 
    ? `[${new Date().toISOString()}] ${message} ${JSON.stringify(data)}`
    : `[${new Date().toISOString()}] ${message}`;
  console.log(formatted);
}

export function warn(message: string, data?: unknown): void {
  if (!globalDebug) return;
  const formatted = data !== undefined 
    ? `[${new Date().toISOString()}] ${message} ${JSON.stringify(data)}`
    : `[${new Date().toISOString()}] ${message}`;
  console.warn(formatted);
}

export function error(message: string, data?: unknown): void {
  // Always log errors
  const formatted = data !== undefined 
    ? `[${new Date().toISOString()}] ${message} ${JSON.stringify(data)}`
    : `[${new Date().toISOString()}] ${message}`;
  console.error(formatted);
}
