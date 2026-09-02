// Popup event handlers

const openButton = document.getElementById('open-sidepanel');

if (openButton) {
  openButton.addEventListener('click', () => {
    try {
      if (!chrome.sidePanel?.open || !chrome.windows?.getCurrent) return;
      chrome.windows.getCurrent((currentWindow) => {
        if (chrome.runtime.lastError || !currentWindow?.id) return;
        chrome.sidePanel.open({ windowId: currentWindow.id }, () => {
          if (chrome.runtime.lastError) {
            console.error('Failed to open side panel:', chrome.runtime.lastError);
          }
        });
      });
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  });
}

// ━━━━━━ Backend URL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// The manifest can only grant localhost up front, so an install pointing at a
// deployed backend has to ask for that origin at runtime. Doing it here, from a
// click, is what Chrome requires for an optional host permission.
const urlInput = document.getElementById('api-base-url') as HTMLInputElement | null;
const saveButton = document.getElementById('save-api-base-url');
const statusEl = document.getElementById('settings-status');

function setStatus(message: string, kind?: string): void {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = kind ? `status ${kind}` : 'status';
}

async function loadCurrentUrl(): Promise<void> {
  if (!urlInput) return;
  try {
    const stored = await chrome.storage.local.get(['apiBaseUrl']);
    urlInput.value = stored?.apiBaseUrl || '';
    if (!stored?.apiBaseUrl) {
      setStatus(`Using default: ${typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : ''}`);
    }
  } catch (error) {
    setStatus('Could not read saved settings', 'error');
  }
}

function requestOrigin(origin: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!chrome.permissions?.request) {
      resolve(true);
      return;
    }
    chrome.permissions.request({ origins: [origin] }, (granted) => resolve(Boolean(granted)));
  });
}

if (saveButton && urlInput) {
  saveButton.addEventListener('click', async () => {
    const normalized = typeof normalizeApiBaseUrl === 'function'
      ? normalizeApiBaseUrl(urlInput.value)
      : null;

    if (!urlInput.value.trim()) {
      await chrome.storage.local.remove('apiBaseUrl');
      setStatus('Cleared. Using the default backend URL.', 'ok');
      return;
    }

    if (!normalized) {
      setStatus('Enter a full http(s) URL, e.g. https://api.example.com', 'error');
      return;
    }

    const granted = await requestOrigin(`${new URL(normalized).origin}/*`);
    if (!granted) {
      setStatus('Permission denied for that origin, so it was not saved.', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({ apiBaseUrl: normalized });
      urlInput.value = normalized;
      setStatus('Saved. The side panel will use this backend.', 'ok');
    } catch (error) {
      setStatus('Could not save that URL', 'error');
    }
  });
}

loadCurrentUrl();
