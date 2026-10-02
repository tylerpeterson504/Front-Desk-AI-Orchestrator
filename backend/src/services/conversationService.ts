/**
 * Conversation Service
 * Manages conversation history and context for multi-turn interactions
 */

import { getRepository } from '../config/database';
import { ResponseEvent } from '../entities/ResponseEvent';
import logger from '../lib/logger';

/**
 * Conversation interface for storing chat history
 */
export interface Conversation {
  id: string;
  userId: string;
  propertyId?: number;
  createdAt: Date;
  updatedAt: Date;
  messages: ConversationMessage[];
  metadata?: {
    guestName?: string;
    roomNumber?: string;
    tone?: string;
  };
}

/**
 * Message in a conversation
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    sender?: string;
    length: number;
    tokens?: number;
  };
}

/**
 * Conversation summary for quick context
 */
export interface ConversationSummary {
  id: string;
  userId: string;
  propertyId?: number;
  lastMessage: string;
  lastMessageAt: Date;
  messageCount: number;
  metadata?: Conversation['metadata'];
}

/**
 * In-memory conversation store
 * In production, this would be backed by a database
 */
const conversations = new Map<string, Conversation>();

/**
 * Response Event Repository for tracking copilot usage
 */
const responseEventRepo = getRepository<ResponseEvent>(ResponseEvent);

/**
 * Conversation Service
 */
export class ConversationService {
  /**
   * Maximum number of messages to keep per conversation
   */
  private readonly MAX_MESSAGES = 50;

  /**
   * Maximum age of conversations in memory (24 hours)
   */
  private readonly MAX_AGE_MS = 24 * 60 * 60 * 1000;

  /**
   * Create a new conversation
   */
  async createConversation(
    userId: string,
    propertyId?: number,
    metadata?: Conversation['metadata']
  ): Promise<Conversation> {
    const conversation: Conversation = {
      id: this.generateId(),
      userId,
      propertyId,
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
      metadata
    };

    conversations.set(conversation.id, conversation);
    logger.info('Conversation created', { conversationId: conversation.id, userId });

    return conversation;
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const conversation = conversations.get(conversationId);
    
    if (!conversation) {
      return null;
    }

    // Check if conversation is expired
    const age = Date.now() - conversation.updatedAt.getTime();
    if (age > this.MAX_AGE_MS) {
      conversations.delete(conversationId);
      return null;
    }

    return conversation;
  }

  /**
   * Get conversations for a user
   */
  async getUserConversations(userId: string): Promise<ConversationSummary[]> {
    const summaries: ConversationSummary[] = [];

    for (const conversation of conversations.values()) {
      if (conversation.userId === userId) {
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        summaries.push({
          id: conversation.id,
          userId: conversation.userId,
          propertyId: conversation.propertyId,
          lastMessage: lastMessage?.content || '',
          lastMessageAt: lastMessage?.timestamp || conversation.updatedAt,
          messageCount: conversation.messages.length,
          metadata: conversation.metadata
        });
      }
    }

    // Sort by last message date, most recent first
    return summaries.sort(
      (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
    );
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    message: Omit<ConversationMessage, 'id' | 'timestamp' | 'metadata'> & { metadata?: ConversationMessage['metadata'] }
  ): Promise<ConversationMessage> {
    const conversation = await this.getConversation(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const messageWithMeta: ConversationMessage = {
      id: this.generateId(),
      ...message,
      timestamp: new Date(),
      metadata: {
        length: message.content.length,
        ...message.metadata
      }
    };

    conversation.messages.push(messageWithMeta);
    conversation.updatedAt = new Date();

    // Trim messages if over limit
    if (conversation.messages.length > this.MAX_MESSAGES) {
      conversation.messages = conversation.messages.slice(-this.MAX_MESSAGES);
    }

    // Save response event for analytics
    if (message.role === 'assistant') {
      // Extract template_ids from metadata if present
      const templateIds = Array.isArray(message.metadata?.template_ids) 
        ? message.metadata.template_ids as number[] 
        : [];
      await this.saveResponseEvent(conversation, messageWithMeta, templateIds);
    }

    return messageWithMeta;
  }

  /**
   * Get conversation messages for LLM context
   */
  async getConversationContext(
    conversationId: string,
    maxMessages?: number
  ): Promise<Array<{ role: string; content: string }>> {
    const conversation = await this.getConversation(conversationId);
    
    if (!conversation) {
      return [];
    }

    const limit = maxMessages || 20;
    const messages = conversation.messages.slice(-limit);

    // Convert to LLM message format
    return messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    const conversation = conversations.get(conversationId);
    
    if (!conversation || conversation.userId !== userId) {
      return false;
    }

    conversations.delete(conversationId);
    logger.info('Conversation deleted', { conversationId, userId });
    return true;
  }

  /**
   * Clear all conversations for a user
   */
  async clearUserConversations(userId: string): Promise<number> {
    let count = 0;

    for (const [id, conversation] of conversations.entries()) {
      if (conversation.userId === userId) {
        conversations.delete(id);
        count++;
      }
    }

    logger.info('User conversations cleared', { userId, count });
    return count;
  }

  /**
   * Save response event for analytics
   */
  private async saveResponseEvent(
    conversation: Conversation,
    message: ConversationMessage,
    templateIds?: number[]
  ): Promise<void> {
    try {
      const responseEvent = responseEventRepo.create({
        conversation_id: conversation.id,
        user_id: conversation.userId,
        property_id: conversation.propertyId,
        response_text: message.content,
        metadata: {
          role: message.role,
          conversation_message_count: conversation.messages.length,
          template_ids: templateIds || [],
          ...conversation.metadata
        }
      });

      await responseEventRepo.save(responseEvent);
      logger.debug('Response event saved', { eventId: responseEvent.id });
    } catch (error) {
      logger.error('Failed to save response event', { error });
    }
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Clean up expired conversations
   */
  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;

    for (const [id, conversation] of conversations.entries()) {
      const age = now - conversation.updatedAt.getTime();
      if (age > this.MAX_AGE_MS) {
        conversations.delete(id);
        count++;
      }
    }

    if (count > 0) {
      logger.info('Expired conversations cleaned up', { count });
    }

    return count;
  }

  /**
   * Get conversation statistics
   */
  async getStats(): Promise<{
    totalConversations: number;
    totalMessages: number;
    activeUsers: number;
  }> {
    const userSet = new Set<string>();
    let totalMessages = 0;

    for (const conversation of conversations.values()) {
      userSet.add(conversation.userId);
      totalMessages += conversation.messages.length;
    }

    return {
      totalConversations: conversations.size,
      totalMessages,
      activeUsers: userSet.size
    };
  }
}

export const conversationService = new ConversationService();

export default conversationService;
