import { getRepository } from '../config/database';
import { Property } from '../entities/Property';
import { Template } from '../entities/Template';
import { AppError, ValidationError, AuthorizationError } from '../lib/errors';
import logger from '../lib/logger';

const GUEST_INFO_FIELDS = [
  'guestName',
  'roomNumber',
  'checkIn',
  'checkOut',
  'reservationStatus',
  'confirmationNumber'
];

const MAX_FIELD_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_MESSAGES = 20;
const MAX_TEMPLATE_IDS = 10;

interface GuestInfo {
  guestName?: string;
  roomNumber?: string;
  checkIn?: string;
  checkOut?: string;
  reservationStatus?: string;
  confirmationNumber?: string;
}

interface ChatMessage {
  sender?: string;
  text: string;
}

interface ChatContext {
  messages?: ChatMessage[];
  activeGuest?: string;
}

interface DraftRequest {
  property_id?: number;
  tone?: string;
  template_ids?: number[];
  guest_info?: GuestInfo;
  chat_context?: ChatContext;
}

interface DraftResponse {
  draft: string;
  meta: {
    provider: string;
    template_count: number;
    property?: { id: number; name: string };
    tone: string;
  };
}

// Collapses control characters and truncates. Keeps ordinary punctuation and
// non-Latin scripts intact.
function scrubText(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  const text = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function sanitizeGuestInfo(raw: unknown): GuestInfo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: GuestInfo = {};
  for (const field of GUEST_INFO_FIELDS) {
    const value = scrubText((raw as Record<string, unknown>)[field], MAX_FIELD_LENGTH);
    if (value) (out as Record<string, string>)[field] = value;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeChatContext(raw: unknown): ChatContext | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const messages: ChatMessage[] = Array.isArray((raw as Record<string, unknown>).messages)
    ? (raw as { messages: unknown[] }).messages
        .slice(-MAX_MESSAGES)
        .map((message) => {
          if (!message || typeof message !== 'object') return null;
          const text = scrubText((message as Record<string, unknown>).text, MAX_MESSAGE_LENGTH);
          if (!text) return null;
          return {
            sender: scrubText((message as Record<string, unknown>).sender, 80) || 'Guest',
            text
          };
        })
        .filter(Boolean) as ChatMessage[]
    : [];

  const activeGuest = scrubText((raw as Record<string, unknown>).activeGuest, MAX_FIELD_LENGTH);
  if (!messages.length && !activeGuest) return null;
  return { messages, activeGuest };
}

export class CopilotService {
  private propertyRepository = getRepository<Property>(Property);
  private templateRepository = getRepository<Template>(Template);

  async draft(request: DraftRequest, userId: string): Promise<DraftResponse> {
    const { property_id, tone, template_ids } = request;

    const toneSafe = tone === 'friendly' ? 'friendly' : 'professional';
    const guestInfo = sanitizeGuestInfo(request.guest_info);
    const chatContext = sanitizeChatContext(request.chat_context);

    // Resolve property (must belong to caller). Never send wifi_password to the LLM.
    let property: Property | null = null;
    if (property_id != null) {
      property = await this.propertyRepository.findOne({
        where: { id: property_id, user_id: userId },
        select: ['id', 'name', 'checkout_time', 'tone_guidelines', 'wifi_ssid']
      });
      if (!property) {
        throw new AuthorizationError('Property not found or access denied');
      }
    }

    // Resolve selected templates (owned by caller)
    let templates: Template[] = [];
    const ids = Array.isArray(template_ids)
      ? template_ids.filter((n) => Number.isInteger(n)).slice(0, MAX_TEMPLATE_IDS)
      : [];
    if (ids.length) {
      templates = await this.templateRepository.find({
        where: { user_id: userId, id: { $in: ids } },
        order: { name: 'ASC' }
      });
    }

    // TODO: Implement actual LLM drafting
    // For now, return a placeholder response
    const draft = this.generatePlaceholderDraft(property, templates, guestInfo, chatContext, toneSafe);

    return {
      draft,
      meta: {
        provider: 'placeholder',
        template_count: templates.length,
        property: property ? { id: property.id, name: property.name } : undefined,
        tone: toneSafe
      }
    };
  }

  private generatePlaceholderDraft(
    property: Property | null,
    templates: Template[],
    guestInfo: GuestInfo | null,
    chatContext: ChatContext | null,
    tone: string
  ): string {
    const lines: string[] = [];

    if (tone === 'friendly') {
      lines.push('Hello!');
    } else {
      lines.push('Dear Guest,');
    }

    if (guestInfo?.guestName) {
      lines[0] = `Hello ${guestInfo.guestName},`;
    }

    if (property) {
      lines.push(`
Thank you for choosing ${property.name}.`);
      if (property.checkout_time) {
        lines.push(`
Our checkout time is ${property.checkout_time}.`);
      }
    }

    if (templates.length > 0) {
      lines.push(`
Based on our templates, here's what we can help you with:`);
      templates.forEach(t => {
        lines.push(`
- ${t.name}: ${t.content.slice(0, 100)}...`);
      });
    }

    if (chatContext?.messages?.length) {
      lines.push(`
Following up on your previous messages:`);
      chatContext.messages.slice(-3).forEach(msg => {
        lines.push(`
  [${msg.sender}]: ${msg.text.slice(0, 50)}...`);
      });
    }

    lines.push(`

How can we assist you further?`);

    return lines.join('\n');
  }
}

export const copilotService = new CopilotService();
