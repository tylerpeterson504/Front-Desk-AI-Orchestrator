import type { ConversationService } from '../src/services/conversationService';

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

const HOUR_MS = 60 * 60 * 1000;

function freshStore(): ConversationService {
  let store: ConversationService | undefined;
  jest.isolateModules(() => {
    store = require('../src/services/conversationService').conversationService;
  });
  return store as ConversationService;
}

describe('conversation store bounds', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not start a timer when the module loads', () => {
    jest.useFakeTimers();

    freshStore();

    expect(jest.getTimerCount()).toBe(0);
  });

  it('starts one sweep timer no matter how often init is called', () => {
    jest.useFakeTimers();
    const store = freshStore();

    store.init();
    store.init();

    expect(jest.getTimerCount()).toBe(1);
  });

  it('removes conversations older than 24 hours on the scheduled sweep', async () => {
    jest.useFakeTimers({ now: Date.now() });
    const store = freshStore();
    store.init();
    await store.createConversation('sweep-user');

    jest.advanceTimersByTime(23 * HOUR_MS);
    expect(await store.getUserConversations('sweep-user')).toHaveLength(1);

    jest.advanceTimersByTime(2 * HOUR_MS);
    expect(await store.getUserConversations('sweep-user')).toHaveLength(0);
  });

  it('evicts the oldest conversation when the store is full', async () => {
    const store = freshStore();
    const oldest = await store.createConversation('cap-oldest');
    for (let i = 0; i < 5000; i++) {
      await store.createConversation(`cap-${i}`);
    }
    const newest = await store.createConversation('cap-newest');

    expect((await store.getStats()).totalConversations).toBe(5000);
    expect(await store.getConversation(oldest.id, 'cap-oldest')).toBeNull();
    expect(await store.getConversation(newest.id, 'cap-newest')).not.toBeNull();
  });
});
