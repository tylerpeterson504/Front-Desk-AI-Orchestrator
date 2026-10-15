// Popup tests for backend URL changes. popup.ts wires its handlers at import time,
// so each test builds the popup's DOM, loads the module, and clicks Save.

import { beforeEach, describe, expect, it, vi } from 'vitest';

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setupDom() {
  document.body.innerHTML = `
    <button id="open-sidepanel"></button>
    <input id="api-base-url" />
    <button id="save-api-base-url"></button>
    <p id="settings-status"></p>
  `;
}

async function loadPopup(stored: Record<string, unknown>) {
  chrome.storage.local.get.mockResolvedValue(stored);
  await import('../src/popup.ts');
  await flush();
}

async function saveUrl(value: string) {
  (document.getElementById('api-base-url') as HTMLInputElement).value = value;
  document.getElementById('save-api-base-url')!.click();
  await flush();
  await flush();
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('../src/config');
  setupDom();
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.storage.local.remove.mockResolvedValue(undefined);
  chrome.permissions.request.mockImplementation((_req: any, cb: any) => cb(true));
});

describe('backend URL changes', () => {
  it('switching to a different backend removes the session and stores the new URL', async () => {
    await loadPopup({ apiBaseUrl: 'https://old.example.com', token: 'tok', refreshToken: 'refresh' });
    await saveUrl('https://new.example.com');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['token', 'refreshToken']);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ apiBaseUrl: 'https://new.example.com' });
  });

  it('saving the backend already in effect keeps the session', async () => {
    await loadPopup({ apiBaseUrl: 'https://api.example.com', token: 'tok', refreshToken: 'refresh' });
    await saveUrl('https://api.example.com/');
    expect(chrome.storage.local.remove).not.toHaveBeenCalledWith(['token', 'refreshToken']);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ apiBaseUrl: 'https://api.example.com' });
  });

  it('clearing a custom backend removes the session and the stored URL', async () => {
    await loadPopup({ apiBaseUrl: 'https://api.example.com', token: 'tok', refreshToken: 'refresh' });
    await saveUrl('');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['token', 'refreshToken']);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('apiBaseUrl');
  });

  it('clearing while the default backend is in effect keeps the session', async () => {
    await loadPopup({ token: 'tok', refreshToken: 'refresh' });
    await saveUrl('');
    expect(chrome.storage.local.remove).not.toHaveBeenCalledWith(['token', 'refreshToken']);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('apiBaseUrl');
  });

  it('a denied origin changes neither the session nor the stored URL', async () => {
    chrome.permissions.request.mockImplementation((_req: any, cb: any) => cb(false));
    await loadPopup({ apiBaseUrl: 'https://old.example.com', token: 'tok', refreshToken: 'refresh' });
    await saveUrl('https://new.example.com');
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('an invalid URL changes neither the session nor the stored URL', async () => {
    await loadPopup({ apiBaseUrl: 'https://old.example.com', token: 'tok', refreshToken: 'refresh' });
    await saveUrl('http://api.example.com');
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(document.getElementById('settings-status')!.classList.contains('error')).toBe(true);
  });
});
