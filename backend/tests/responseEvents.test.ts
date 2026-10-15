import { getRepository } from '../src/config/database';
import { conversationService } from '../src/services/conversationService';

jest.mock('../src/config/database', () => {
  const repo = { create: jest.fn((data: unknown) => data), save: jest.fn() };
  return { getRepository: jest.fn(() => repo) };
});

jest.mock('../src/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('draft response events', () => {
  const responseRepo = (getRepository as unknown as jest.Mock)();

  it('records a draft without a reply time', async () => {
    const conversation = await conversationService.createConversation('owner-draft', 9);

    await conversationService.addMessage(conversation.id, 'owner-draft', { role: 'assistant', content: 'Draft reply' });

    const saved = responseRepo.create.mock.calls.at(-1)[0];
    expect(saved.replied_at).toBeNull();
    expect(saved.first_seen_at).toBe(conversation.createdAt);
    expect(saved.property_id).toBe(9);
    expect(responseRepo.save).toHaveBeenCalled();
  });

  it('keeps first_seen_at at the first observation for later drafts', async () => {
    const conversation = await conversationService.createConversation('owner-draft-2');

    await conversationService.addMessage(conversation.id, 'owner-draft-2', { role: 'assistant', content: 'First draft' });
    await conversationService.addMessage(conversation.id, 'owner-draft-2', { role: 'assistant', content: 'Second draft' });

    const [first, second] = responseRepo.create.mock.calls.slice(-2).map((call: unknown[]) => call[0]);
    expect(first.first_seen_at).toBe(conversation.createdAt);
    expect(second.first_seen_at).toBe(conversation.createdAt);
    expect(second.replied_at).toBeNull();
  });
});
