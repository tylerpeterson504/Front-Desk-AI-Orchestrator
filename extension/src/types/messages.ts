// Message types for extension communication
// This provides type safety for messages between content scripts, background, and side panel

export type MessageType =
  // Content script -> Side panel
  | { type: 'GUEST_INFO_UPDATED'; data: GuestInfo }
  | { type: 'CHAT_CONTEXT_UPDATED'; data: ChatContext }
  | { type: 'INJECT_MESSAGE'; text: string }
  
  // Side panel -> Content script
  | { type: 'GET_GUEST_INFO' }
  | { type: 'GET_CHAT_CONTEXT' }
  | { type: 'INJECT_TO_INPUT'; text: string; selector?: string }
  
  // Background -> Side panel
  | { type: 'LOG_ERROR'; data: ErrorLog }
  | { type: 'NOTIFICATION'; data: NotificationData }
  
  // General
  | { type: string; [key: string]: unknown };

// Data types
export interface GuestInfo {
  guestName?: string;
  roomNumber?: string;
  checkIn?: string;
  checkOut?: string;
  reservationStatus?: string;
  confirmationNumber?: string;
  email?: string;
  phone?: string;
  propertyId?: number;
}

export interface ChatMessage {
  sender?: string;
  text: string;
  timestamp?: string;
  id?: string;
}

export interface ChatContext {
  messages: ChatMessage[];
  activeGuest?: string;
  conversationId?: string;
  propertyId?: number;
}

export interface ErrorLog {
  context: string;
  message: string;
  stack?: string;
  timestamp: string;
  url?: string;
  userAgent?: string;
}

export interface NotificationData {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

// Response types for message handlers
export interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Helper type for message handlers
export type MessageHandler<T extends MessageType> = (
  message: T,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: MessageResponse) => void
) => void | Promise<void>;

// Type guard for message type
export function isMessageType(message: unknown): message is MessageType {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as Record<string, unknown>).type === 'string'
  );
}

// Type guard for specific message types
export function isGuestInfoUpdated(message: unknown): message is { type: 'GUEST_INFO_UPDATED'; data: GuestInfo } {
  return (
    isMessageType(message) &&
    message.type === 'GUEST_INFO_UPDATED' &&
    'data' in message
  );
}

export function isChatContextUpdated(message: unknown): message is { type: 'CHAT_CONTEXT_UPDATED'; data: ChatContext } {
  return (
    isMessageType(message) &&
    message.type === 'CHAT_CONTEXT_UPDATED' &&
    'data' in message
  );
}

export function isInjectMessage(message: unknown): message is { type: 'INJECT_MESSAGE'; text: string } {
  return (
    isMessageType(message) &&
    message.type === 'INJECT_MESSAGE' &&
    'text' in message
  );
}

export function isGetGuestInfo(message: unknown): message is { type: 'GET_GUEST_INFO' } {
  return (
    isMessageType(message) &&
    message.type === 'GET_GUEST_INFO'
  );
}

export function isGetChatContext(message: unknown): message is { type: 'GET_CHAT_CONTEXT' } {
  return (
    isMessageType(message) &&
    message.type === 'GET_CHAT_CONTEXT'
  );
}
