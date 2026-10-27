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

describe('conversation analytics metadata', () => {
  it('records tone and template ids without guest details', async () => {
    const responseRepo = (getRepository as unknown as jest.Mock)();
    const guest = {
      tone: 'friendly',
      guestName: 'John Doe',
      roomNumber: '101',
      confirmationNumber: 'ABC123',
      checkIn: '2026-10-20',
      checkOut: '2026-10-22',
      reservationStatus: 'confirmed'
    };
    const conversation = await conversationService.createConversation('owner-analytics', 7, guest);

    await conversationService.addMessage(conversation.id, 'owner-analytics', {
      role: 'assistant',
      content: 'Reply',
      metadata: { length: 5, template_ids: [3] }
    });

    const saved = responseRepo.create.mock.calls.at(-1)[0];
    expect(saved.user_id).toBe('owner-analytics');
    expect(saved.property_id).toBe(7);
    expect(saved.metadata).toEqual(expect.objectContaining({ tone: 'friendly', template_ids: [3] }));
    expect(saved.metadata).not.toHaveProperty('guestName');
    expect(saved.metadata).not.toHaveProperty('roomNumber');
    expect(saved.metadata).not.toHaveProperty('confirmationNumber');
  });
});
