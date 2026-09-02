// @ts-nocheck
import { isValidEmail, MAX_EMAIL_LENGTH } from '../src/lib/validateEmail';

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    const valid = [
      'a@b.co',
      'agent@example.com',
      'first.last@sub.domain.example.org',
      'user+tag@example.com',
      "o'brien@example.com",
      `${'a'.repeat(60)}@example.com`
    ];
    for (const email of valid) {
      expect(isValidEmail(email)).toBe(true);
    }
  });

  it('rejects malformed addresses', () => {
    const invalid = [
      'no-at-sign.example.com',
      'two@at@signs.com',
      'no-domain-dot@example',
      'trailing-dot@example.',
      'double..dot@example',
      'spa ce@example.com',
      'tab\t@example.com',
      '@example.com',
      'local@',
      '@',
      ''
    ];
    for (const email of invalid) {
      expect(isValidEmail(email)).toBe(false);
    }
  });

  it('rejects non-strings', () => {
    for (const value of [undefined, null, 42, {}, [], true]) {
      expect(isValidEmail(value)).toBe(false);
    }
  });

  it('enforces the RFC 5321 length limit', () => {
    const local = 'a'.repeat(MAX_EMAIL_LENGTH - 'example.com'.length - 1);
    expect(isValidEmail(`${local}@example.com`)).toBe(true);
    expect(isValidEmail(`${local}a@example.com`)).toBe(false);
  });

  it('rejects the old regex ReDoS input in linear time', () => {
    const hostile = `${'a'.repeat(50)}@${'a.'.repeat(100)}`;

    const started = process.hrtime.bigint();
    expect(isValidEmail(hostile)).toBe(false);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    expect(elapsedMs).toBeLessThan(50);
  });
});