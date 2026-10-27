import { conversationService } from '../src/services/conversationService';

jest.mock('../src/config/database', () => ({
  getRepository: jest.fn(() => ({
    create: jest.fn((data: unknown) => data),
    save: jest.fn()
  }))
}));

jest.mock('../src/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('conversationService ownership', () => {
  it('returns a conversation to its owner', async () => {
    const conversation = await conversationService.createConversation('owner-1');

    const found = await conversationService.getConversation(conversation.id, 'owner-1');

    expect(found?.id).toBe(conversation.id);
  });

  it('returns null to another user and keeps the conversation for its owner', async () => {
    const conversation = await conversationService.createConversation('owner-2');

    expect(await conversationService.getConversation(conversation.id, 'other-user')).toBeNull();
    expect(await conversationService.getConversation(conversation.id, 'owner-2')).not.toBeNull();
  });

  it('rejects a message from another user and appends nothing', async () => {
    const conversation = await conversationService.createConversation('owner-3');

    await expect(
      conversationService.addMessage(conversation.id, 'other-user', { role: 'user', content: 'Hello' })
    ).rejects.toThrow('not found');

    const stored = await conversationService.getConversation(conversation.id, 'owner-3');
    expect(stored?.messages).toHaveLength(0);
  });

  it('returns no context to another user', async () => {
    const conversation = await conversationService.createConversation('owner-4');
    await conversationService.addMessage(conversation.id, 'owner-4', { role: 'user', content: 'Hello' });

    expect(await conversationService.getConversationContext(conversation.id, 'other-user')).toEqual([]);
  });
});
