// Background service worker
// Relays messages between content scripts and the side panel
// Enhanced with type safety and error handling

import type { MessageType, GuestInfo, ChatContext } from './types';

// Message handler with type safety
function handleMessage(message: MessageType, sender: chrome.runtime.MessageSender): void {
  // Forward guest info and chat context updates from content scripts to any open side panel
  if (message.type === 'GUEST_INFO_UPDATED' || message.type === 'CHAT_CONTEXT_UPDATED') {
    // Broadcast to all open side panels
    chrome.runtime.sendMessage(message).catch(() => {
      // Side panel not open — ignore
    });
  }
  
  // Handle errors from content scripts
  if (message.type === 'LOG_ERROR') {
    console.error('Content script error:', message);
    // Could forward to error tracking service
  }
}

// Set up message listener with error handling
try {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    try {
      // Validate message has a type
      if (!message || typeof message !== 'object' || !('type' in message)) {
        console.warn('Invalid message format:', message);
        return;
      }
      
      const typedMessage = message as MessageType;
      handleMessage(typedMessage, sender);
    } catch (error) {
      console.error('Error handling message:', error, message);
    }
  });
} catch (error) {
  console.error('Failed to set up message listener:', error);
}

// Handle runtime errors
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Front Desk AI extension installed/updated:', details.reason);
});

chrome.runtime.onSuspend.addListener(() => {
  console.log('Front Desk AI extension suspended');
});

// Handle runtime errors globally
if (chrome.runtime.onMessage.hasListeners) {
  chrome.runtime.lastError; // Clear any existing errors
}
