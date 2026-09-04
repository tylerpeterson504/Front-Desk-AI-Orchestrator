import { getRepository } from '../src/config/database';
import { Property } from '../src/entities/Property';
import { Template } from '../src/entities/Template';
import { CopilotService, copilotService } from '../src/services/copilotService';
import { AuthorizationError } from '../src/lib/errors';

// Mock database repositories
jest.mock('../src/config/database', () => ({
  getRepository: jest.fn((entity: any) => {
    const mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };
    return mockRepo;
  })
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

// Mock LLM clients
jest.mock('../src/services/llm/perplexityClient', () => ({
  isConfigured: jest.fn(() => false),
  complete: jest.fn()
}));

jest.mock('../src/services/llm/mistralClient', () => ({
  isConfigured: jest.fn(() => false),
  complete: jest.fn()
}));

jest.mock('../src/services/llm/huggingfaceClient', () => ({
  isConfigured: jest.fn(() => false),
  complete: jest.fn()
}));

jest.mock('../src/services/llm/geminiClient', () => ({
  isConfigured: jest.fn(() => false),
  complete: jest.fn()
}));

describe('CopilotService', () => {
  let copilotService: CopilotService;
  let mockPropertyRepo: any;
  let mockTemplateRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    copilotService = new CopilotService();
    mockPropertyRepo = getRepository(Property);
    mockTemplateRepo = getRepository(Template);
  });

  describe('sanitizeGuestInfo', () => {
    it('should return null for invalid input', () => {
      const result = copilotService['sanitizeGuestInfo'](null);
      expect(result).toBeNull();

      const result2 = copilotService['sanitizeGuestInfo']('string');
      expect(result2).toBeNull();

      const result3 = copilotService['sanitizeGuestInfo']([]);
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

      const result = copilotService['sanitizeGuestInfo'](raw);
      expect(result).toBeDefined();
      expect(result?.guestName).toBe('John Doe');
      expect(result?.roomNumber).toBe('101');
      expect(result?.maliciousField).toBeUndefined();
    });

    it('should handle control characters', () => {
      const raw = {
        guestName: 'John\u0000Doe\u001F'
      };

      const result = copilotService['sanitizeGuestInfo'](raw);
      expect(result?.guestName).toBe('John Doe');
    });

    it('should truncate long values', () => {
      const longName = 'a'.repeat(300);
      const raw = { guestName: longName };

      const result = copilotService['sanitizeGuestInfo'](raw);
      expect(result?.guestName?.length).toBeLessThanOrEqual(200);
      expect(result?.guestName?.endsWith('\u2026')).toBe(true);
    });
  });

  describe('sanitizeChatContext', () => {
    it('should return null for invalid input', () => {
      const result = copilotService['sanitizeChatContext'](null);
      expect(result).toBeNull();

      const result2 = copilotService['sanitizeChatContext']('string');
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

      const result = copilotService['sanitizeChatContext'](raw);
      expect(result).toBeDefined();
      expect(result?.messages).toHaveLength(3);
      expect(result?.messages?.[0].sender).toBe('Guest');
      expect(result?.messages?.[2].sender).toBe('Guest'); // Default sender
    });

    it('should limit message count', () => {
      const messages = Array.from({ length: 30 }, (_, i) => ({
        sender: `User${i}`,
        text: `Message ${i}`
      }));

      const raw = { messages };
      const result = copilotService['sanitizeChatContext'](raw);
      expect(result?.messages?.length).toBeLessThanOrEqual(20);
    });

    it('should handle control characters in messages', () => {
      const raw = {
        messages: [
          { sender: 'Guest', text: 'Hello\u0000World\u001F' }
        ]
      };

      const result = copilotService['sanitizeChatContext'](raw);
      expect(result?.messages?.[0].text).toBe('Hello World');
    });
  });

  describe('buildPrompt', () => {
    it('should build prompt with property info', () => {
      const property = {
        id: 1,
        name: 'Grand Hotel',
        checkout_time: '11:00 AM',
        tone_guidelines: 'Friendly',
        wifi_ssid: 'HotelWiFi'
      } as Property;

      const result = copilotService['buildPrompt']({
        property,
        guestInfo: null,
        chatContext: null,
        templates: [],
        tone: 'professional'
      });

      expect(result).toContain('Grand Hotel');
      expect(result).toContain('11:00 AM');
      expect(result).toContain('professional, formal, courteous');
    });

    it('should include fenced guest info', () => {
      const guestInfo = {
        guestName: 'John Doe',
        roomNumber: '101'
      };

      const result = copilotService['buildPrompt']({
        property: null,
        guestInfo,
        chatContext: null,
        templates: [],
        tone: 'friendly'
      });

      expect(result).toContain('<<<UNTRUSTED_DATA reservation');
      expect(result).toContain('UNTRUSTED_DATA>>> reservation');
      expect(result).toContain('guestName: John Doe');
    });

    it('should include fenced chat context', () => {
      const chatContext = {
        messages: [
          { sender: 'Guest', text: 'Hello' }
        ]
      };

      const result = copilotService['buildPrompt']({
        property: null,
        guestInfo: null,
        chatContext,
        templates: [],
        tone: 'friendly'
      });

      expect(result).toContain('<<<UNTRUSTED_DATA chat');
      expect(result).toContain('UNTRUSTED_DATA>>> chat');
      expect(result).toContain('Guest: Hello');
    });

    it('should include templates', () => {
      const templates = [
        { id: 1, name: 'Welcome', content: 'Welcome to our hotel!' } as Template
      ];

      const result = copilotService['buildPrompt']({
        property: null,
        guestInfo: null,
        chatContext: null,
        templates,
        tone: 'friendly'
      });

      expect(result).toContain('[Welcome] Welcome to our hotel!');
    });

    it('should neutralize fence markers in content', () => {
      const guestInfo = {
        guestName: '<<<UNTRUSTED_DATA test'
      };

      const result = copilotService['buildPrompt']({
        property: null,
        guestInfo,
        chatContext: null,
        templates: [],
        tone: 'friendly'
      });

      expect(result).toContain('<untrusted test');
      expect(result).not.toContain('<<<UNTRUSTED_DATA test');
    });
  });

  describe('draft', () => {
    it('should throw AuthorizationError for non-existent property', async () => {
      mockPropertyRepo.findOne.mockResolvedValue(null);

      await expect(
        copilotService.draft({ property_id: 999 }, 'user-1')
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw AuthorizationError for property not owned by user', async () => {
      const property = { id: 1, name: 'Hotel', user_id: 'other-user' };
      mockPropertyRepo.findOne.mockResolvedValue(property);

      await expect(
        copilotService.draft({ property_id: 1 }, 'user-1')
      ).rejects.toThrow(AuthorizationError);
    });

    it('should return draft with property info', async () => {
      const property = { id: 1, name: 'Grand Hotel', user_id: 'user-1' };
      mockPropertyRepo.findOne.mockResolvedValue(property);
      mockTemplateRepo.find.mockResolvedValue([]);

      const result = await copilotService.draft(
        { property_id: 1, tone: 'professional' },
        'user-1'
      );

      expect(result.draft).toBeDefined();
      expect(result.meta.property?.name).toBe('Grand Hotel');
      expect(result.meta.tone).toBe('professional');
    });

    it('should include templates in draft', async () => {
      const property = { id: 1, name: 'Grand Hotel', user_id: 'user-1' };
      const templates = [
        { id: 1, name: 'Welcome', content: 'Welcome!', user_id: 'user-1' } as Template
      ];

      mockPropertyRepo.findOne.mockResolvedValue(property);
      mockTemplateRepo.find.mockResolvedValue(templates);

      const result = await copilotService.draft(
        { property_id: 1, template_ids: [1] },
        'user-1'
      );

      expect(result.meta.template_count).toBe(1);
    });

    it('should sanitize guest info in draft', async () => {
      const property = { id: 1, name: 'Grand Hotel', user_id: 'user-1' };
      mockPropertyRepo.findOne.mockResolvedValue(property);
      mockTemplateRepo.find.mockResolvedValue([]);

      const result = await copilotService.draft(
        {
          property_id: 1,
          guest_info: { guestName: 'John\u0000Doe' }
        },
        'user-1'
      );

      expect(result.draft).toBeDefined();
    });
  });

  describe('neutralizeFences', () => {
    it('should neutralize fence open markers', () => {
      const result = copilotService['neutralizeFences']('<<<UNTRUSTED_DATA test');
      expect(result).toBe('<untrusted test');
    });

    it('should neutralize fence close markers', () => {
      const result = copilotService['neutralizeFences']('test UNTRUSTED_DATA>>>');
      expect(result).toBe('test untrusted>');
    });

    it('should handle null/undefined', () => {
      const result = copilotService['neutralizeFences'](null as any);
      expect(result).toBe('');
    });
  });

  describe('fenced', () => {
    it('should wrap lines with fence markers', () => {
      const result = copilotService['fenced']('test', ['line1', 'line2']);
      expect(result).toEqual([
        '<<<UNTRUSTED_DATA test',
        'line1',
        'line2',
        'UNTRUSTED_DATA>>> test'
      ]);
    });

    it('should neutralize fence markers in content', () => {
      const result = copilotService['fenced']('test', ['<<<UNTRUSTED_DATA nested']);
      expect(result[1]).toBe('<untrusted nested');
    });
  });
});

describe('copilotService singleton', () => {
  it('should export a singleton instance', () => {
    expect(copilotService).toBeInstanceOf(CopilotService);
  });
});
