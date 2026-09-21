import { getRepository } from '../src/config/database';
import { Property } from '../src/entities/Property';
import { Template } from '../src/entities/Template';
import { AuthorizationError } from '../src/lib/errors';
import { createMockRepository, createMockProperty, createMockTemplate } from './utils';

// Mock database BEFORE importing CopilotService
jest.mock('../src/config/database', () => ({
  getRepository: jest.fn((entity: any) => createMockRepository())
}));

// Mock logger
jest.mock('../src/lib/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock LLM client - must be configured for tests to pass
jest.mock('../src/services/llm/mistralClient', () => ({
  isConfigured: jest.fn(() => true),
  complete: jest.fn().mockResolvedValue({
    text: 'Test response from LLM',
    model: 'mistral-small-latest'
  })
}));

// Import CopilotService AFTER mocks are set up
import { CopilotService, copilotService } from '../src/services/copilotService';

describe('CopilotService', () => {
  let service: CopilotService;
  let mockPropertyRepo: ReturnType<typeof createMockRepository>;
  let mockTemplateRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPropertyRepo = createMockRepository<Property>();
    mockTemplateRepo = createMockRepository<Template>();

    (getRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === Property) return mockPropertyRepo;
      if (entity === Template) return mockTemplateRepo;
      return createMockRepository();
    });

    service = new CopilotService();
  });

  describe('sanitizeGuestInfo', () => {
    it('should return null for invalid input', () => {
      const result = (service as any).sanitizeGuestInfo(null);
      expect(result).toBeNull();
      const result2 = (service as any).sanitizeGuestInfo('string');
      expect(result2).toBeNull();
      const result3 = (service as any).sanitizeGuestInfo([]);
      expect(result3).toBeNull();
    });

    it('should sanitize and filter guest info fields', () => {
      const raw = {
        guestName: 'John Doe',
        roomNumber: '101',
        checkIn: '2024-01-15',
        checkOut: '2024-01-20',
        reservationStatus: 'confirmed',
        confirmationNumber: 'ABC123',
        maliciousField: '<script>alert(1)</script>'
      };
      const result = (service as any).sanitizeGuestInfo(raw);
      expect(result).toBeDefined();
      expect(result?.guestName).toBe('John Doe');
      expect(result?.roomNumber).toBe('101');
      expect(result?.maliciousField).toBeUndefined();
    });

    it('should handle control characters', () => {
      const raw = { guestName: 'John' + String.fromCharCode(0) + 'Doe' + String.fromCharCode(31) };
      const result = (service as any).sanitizeGuestInfo(raw);
      expect(result?.guestName).toBe('John Doe');
    });

    it('should truncate long values', () => {
      const longName = 'a'.repeat(300);
      const raw = { guestName: longName };
      const result = (service as any).sanitizeGuestInfo(raw);
      // MAX_FIELD_LENGTH is 200, so result should be 199 chars + 1 ellipsis = 200
      expect(result?.guestName?.length).toBeLessThanOrEqual(200);
      expect(result?.guestName?.endsWith('…')).toBe(true);
    });
  });

  describe('sanitizeChatContext', () => {
    it('should return null for invalid input', () => {
      const result = (service as any).sanitizeChatContext(null);
      expect(result).toBeNull();
      const result2 = (service as any).sanitizeChatContext('string');
      expect(result2).toBeNull();
    });

    it('should sanitize chat messages', () => {
      const raw = {
        messages: [
          { sender: 'Guest', text: 'Hello there' },
          { sender: 'Agent', text: 'How can I help?' },
          { text: 'No sender' }
        ]
      };
      const result = (service as any).sanitizeChatContext(raw);
      expect(result).toBeDefined();
      expect(result?.messages).toHaveLength(3);
      expect(result?.messages?.[0].sender).toBe('Guest');
      expect(result?.messages?.[2].sender).toBe('Guest');
    });

    it('should limit message count', () => {
      const messages = Array.from({ length: 30 }, (_, i) => ({
        sender: 'User' + i,
        text: 'Message ' + i
      }));
      const raw = { messages };
      const result = (service as any).sanitizeChatContext(raw);
      expect(result?.messages?.length).toBeLessThanOrEqual(20);
    });
  });

  describe('buildPrompt', () => {
    it('should build prompt with property info', () => {
      const property = createMockProperty({ id: 1, name: 'Grand Hotel' });
      const result = (service as any).buildPrompt({
        property,
        guestInfo: null,
        chatContext: null,
        templates: [],
        tone: 'professional'
      });
      expect(result).toContain('Grand Hotel');
      expect(result).toContain('professional');
    });

    it('should include fenced guest info', () => {
      const guestInfo = { guestName: 'John Doe', roomNumber: '101' };
      const result = (service as any).buildPrompt({
        property: null,
        guestInfo,
        chatContext: null,
        templates: [],
        tone: 'friendly'
      });
      expect(result).toContain('UNTRUSTED_DATA reservation');
      expect(result).toContain('guestName: John Doe');
    });

    it('should include templates', () => {
      const templates = [
        { id: 1, name: 'Welcome', content: 'Welcome to our hotel!', property: createMockProperty(), user_id: 'test' } as unknown as Template
      ];
      const result = (service as any).buildPrompt({
        property: null,
        guestInfo: null,
        chatContext: null,
        templates,
        tone: 'friendly'
      });
      expect(result).toContain('[Welcome] Welcome to our hotel!');
    });
  });

  describe('draft', () => {
    it('should throw AuthorizationError for non-existent property', async () => {
      mockPropertyRepo.findOne.mockResolvedValue(null);
      await expect(service.draft({ property_id: 999 }, 'user-1')).rejects.toThrow(AuthorizationError);
    });

    it('should throw AuthorizationError for property not owned by user', async () => {
      // When property doesn't belong to user, findOne returns null
      mockPropertyRepo.findOne.mockResolvedValue(null);
      await expect(service.draft({ property_id: 1 }, 'user-1')).rejects.toThrow(AuthorizationError);
    });

    it('should return draft with property info', async () => {
      const property = { 
        id: 1, 
        name: 'Grand Hotel', 
        user_id: 'user-1',
        checkout_time: '11:00',
        tone_guidelines: 'professional',
        wifi_ssid: 'HotelWiFi'
      } as unknown as Property;
      mockPropertyRepo.findOne.mockResolvedValue(property);
      mockTemplateRepo.find.mockResolvedValue([]);

      const result = await service.draft({ property_id: 1, tone: 'professional' }, 'user-1');
      expect(result.draft).toBeDefined();
      expect(result.meta.property?.name).toBe('Grand Hotel');
      expect(result.meta.tone).toBe('professional');
    });
  });

  describe('neutralizeFences', () => {
    it('should neutralize fence markers', () => {
      const result = (service as any).neutralizeFences('<<<UNTRUSTED_DATA test');
      expect(result).toBe('<untrusted test');
    });

    it('should handle null', () => {
      const result = (service as any).neutralizeFences(null);
      expect(result).toBe('');
    });
  });
});

describe('copilotService singleton', () => {
  it('should export a singleton instance', () => {
    expect(copilotService).toBeInstanceOf(CopilotService);
  });
});
