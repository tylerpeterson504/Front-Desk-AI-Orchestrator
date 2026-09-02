// Shared utilities for all content scripts
// This module provides common functionality for content scripts

import { getApiBaseUrl, getPropertyConfig, PropertyConfig } from './config';

export interface MessageType {
  type: 'GUEST_INFO_UPDATED' | 'CHAT_CONTEXT_UPDATED' | 'GET_GUEST_INFO' | 'GET_CHAT_CONTEXT' | 'INJECT_MESSAGE';
  data?: unknown;
}

export interface GuestInfo {
  guestName?: string;
  roomNumber?: string;
  checkIn?: string;
  checkOut?: string;
  reservationStatus?: string;
  confirmationNumber?: string;
}

export interface ChatContext {
  messages?: Array<{ sender?: string; text: string }>;
  activeGuest?: string;
}

/**
 * Send a message to the side panel
 */
export function sendToSidePanel(message: MessageType): void {
  try {
    // Send to side panel if open
    chrome.runtime.sendMessage(message).catch(() => {
      // Side panel not open - ignore
    });
  } catch (error) {
    console.error('Failed to send message to side panel:', error);
  }
}

/**
 * Broadcast a message to all open side panels
 */
export function broadcastToSidePanel(message: MessageType): void {
  try {
    chrome.runtime.sendMessage(message).catch(() => {
      // No side panel open
    });
  } catch (error) {
    console.error('Failed to broadcast message:', error);
  }
}

/**
 * Get the current property configuration
 */
export function getCurrentProperty(): PropertyConfig | null {
  try {
    return getPropertyConfig();
  } catch (error) {
    console.error('Failed to get property config:', error);
    return null;
  }
}

/**
 * Get the API base URL
 */
export function getApiUrl(): string {
  return getApiBaseUrl();
}

/**
 * Safely extract text from DOM element
 */
export function safeTextContent(element: Element | null): string {
  if (!element) return '';
  return element.textContent?.trim() || '';
}

/**
 * Safely get attribute value
 */
export function safeGetAttribute(element: Element | null, attr: string): string {
  if (!element) return '';
  return element.getAttribute(attr) || '';
}

/**
 * Debounce function for rate limiting
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

/**
 * Throttle function for rate limiting
 */
export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  func: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await func();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Check if element is visible
 */
export function isVisible(element: Element | null): boolean {
  if (!element) return false;

  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0
  );
}

/**
 * Wait for element to be present in DOM
 */
export function waitForElement(
  selector: string,
  timeout: number = 5000
): Promise<Element | null> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const check = () => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
      } else if (Date.now() - startTime >= timeout) {
        resolve(null);
      } else {
        requestAnimationFrame(check);
      }
    };

    check();
  });
}

/**
 * Wait for element to be visible
 */
export async function waitForVisible(
  selector: string,
  timeout: number = 5000
): Promise<Element | null> {
  const element = await waitForElement(selector, timeout);
  if (!element) return null;

  const startTime = Date.now();
  while (!isVisible(element) && Date.now() - startTime < timeout) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  return isVisible(element) ? element : null;
}

/**
 * Extract guest information from page
 */
export function extractGuestInfo(): Partial<GuestInfo> {
  const guestInfo: Partial<GuestInfo> = {};

  // Try to find guest name
  const nameElement = document.querySelector(
    '[data-testid="guest-name"], .guest-name, #guestName, [name="guestName"]'
  );
  if (nameElement) {
    guestInfo.guestName = safeTextContent(nameElement);
  }

  // Try to find room number
  const roomElement = document.querySelector(
    '[data-testid="room-number"], .room-number, #roomNumber, [name="roomNumber"]'
  );
  if (roomElement) {
    guestInfo.roomNumber = safeTextContent(roomElement);
  }

  // Try to find check-in date
  const checkInElement = document.querySelector(
    '[data-testid="check-in"], .check-in, #checkIn, [name="checkIn"]'
  );
  if (checkInElement) {
    guestInfo.checkIn = safeTextContent(checkInElement);
  }

  // Try to find check-out date
  const checkOutElement = document.querySelector(
    '[data-testid="check-out"], .check-out, #checkOut, [name="checkOut"]'
  );
  if (checkOutElement) {
    guestInfo.checkOut = safeTextContent(checkOutElement);
  }

  // Try to find reservation status
  const statusElement = document.querySelector(
    '[data-testid="reservation-status"], .status, #status, [name="status"]'
  );
  if (statusElement) {
    guestInfo.reservationStatus = safeTextContent(statusElement);
  }

  // Try to find confirmation number
  const confirmationElement = document.querySelector(
    '[data-testid="confirmation-number"], .confirmation, #confirmation, [name="confirmation"]'
  );
  if (confirmationElement) {
    guestInfo.confirmationNumber = safeTextContent(confirmationElement);
  }

  return guestInfo;
}

/**
 * Extract chat context from page
 */
export function extractChatContext(): Partial<ChatContext> {
  const chatContext: Partial<ChatContext> = {};

  // Try to find active guest in chat
  const activeGuestElement = document.querySelector(
    '[data-testid="active-guest"], .active-guest, #activeGuest'
  );
  if (activeGuestElement) {
    chatContext.activeGuest = safeTextContent(activeGuestElement);
  }

  // Try to find chat messages
  const messages: Array<{ sender?: string; text: string }> = [];
  const messageElements = document.querySelectorAll(
    '[data-testid="chat-message"], .chat-message, .message'
  );

  messageElements.forEach((element) => {
    const senderElement = element.querySelector(
      '[data-testid="message-sender"], .sender, .message-sender'
    );
    const textElement = element.querySelector(
      '[data-testid="message-text"], .text, .message-text'
    );

    if (textElement) {
      messages.push({
        sender: senderElement ? safeTextContent(senderElement) : undefined,
        text: safeTextContent(textElement)
      });
    }
  });

  if (messages.length > 0) {
    chatContext.messages = messages;
  }

  return chatContext;
}

/**
 * Inject text into an input field or textarea
 */
export function injectText(text: string): boolean {
  try {
    // Try to find active input/textarea
    const activeElement = document.activeElement;
    if (
      activeElement &&
      (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')
    ) {
      const input = activeElement as HTMLInputElement | HTMLTextAreaElement;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const value = input.value || '';

      input.value = value.substring(0, start) + text + value.substring(end);
      input.selectionStart = start + text.length;
      input.selectionEnd = start + text.length;

      // Trigger input event for React/Vue/Angular
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    }

    // Try to find first textarea
    const textarea = document.querySelector('textarea');
    if (textarea) {
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const value = textarea.value || '';

      textarea.value = value.substring(0, start) + text + value.substring(end);
      textarea.selectionStart = start + text.length;
      textarea.selectionEnd = start + text.length;

      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to inject text:', error);
    return false;
  }
}

/**
 * Inject text into a specific selector
 */
export function injectTextToSelector(selector: string, text: string): boolean {
  try {
    const element = document.querySelector(selector);
    if (!element) return false;

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const value = input.value || '';

      input.value = value.substring(0, start) + text + value.substring(end);
      input.selectionStart = start + text.length;
      input.selectionEnd = start + text.length;

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    }

    // For contenteditable elements
    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        return true;
      }

      element.textContent += text;
      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to inject text to selector:', error);
    return false;
  }
}

/**
 * Log error to both console and background
 */
export function logError(error: Error, context: string = 'Content Script'): void {
  console.error('[' + context + ']', error);
  
  try {
    chrome.runtime.sendMessage({
      type: 'LOG_ERROR',
      data: {
        context,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    }).catch(() => {
      // Background not available
    });
  } catch (e) {
    // Ignore
  }
}
