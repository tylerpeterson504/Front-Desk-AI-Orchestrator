// Background service worker
// Relays messages between content scripts and the side panel

chrome.runtime.onMessage.addListener((message, sender) => {
  // Forward guest info and chat context updates from content scripts to any open side panel
  if (
    message.type === 'GUEST_INFO_UPDATED' ||
    message.type === 'CHAT_CONTEXT_UPDATED'
  ) {
    chrome.runtime.sendMessage(message).catch(() => {
      // Side panel not open — ignore
    });
  }
});
