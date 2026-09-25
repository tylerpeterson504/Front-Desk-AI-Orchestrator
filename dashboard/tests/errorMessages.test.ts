import { describe, expect, it } from 'vitest';
import { toUserMessage } from '../src/lib/errorMessages';

describe('toUserMessage', () => {
  it('explains connectivity failures without a response', () => {
    expect(toUserMessage({ request: {} })).toMatch(/check your internet connection/i);
  });

  it('prefers the API error for HTTP responses', () => {
    expect(toUserMessage({ response: { status: 400, data: { error: 'Incorrect field' } } })).toBe('Incorrect field');
  });

  it('preserves status defaults and the server fallback', () => {
    expect(toUserMessage({ response: { status: 401 } })).toMatch(/session has expired/i);
    expect(toUserMessage({ response: { status: 502 } })).toMatch(/on our side/i);
  });
});
