import { config } from '../src/config';
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  isEncryptionConfigured,
} from '../src/lib/secretBox';

jest.mock('../src/config', () => ({
  config: {
    JWT_SECRET: 'test-secret-for-testing-only-with-minimum-32-characters',
    WIFI_ENCRYPTION_KEY: undefined,
  },
}));

describe('secretBox', () => {
  afterEach(() => {
    config.WIFI_ENCRYPTION_KEY = undefined;
  });

  it('round trips a Wi-Fi password through encryptSecret and decryptSecret', () => {
    const ciphertext = encryptSecret('Harbor-Guest 2024!');

    expect(decryptSecret(ciphertext)).toBe('Harbor-Guest 2024!');
  });

  it('recognizes encryptSecret output as encrypted', () => {
    expect(isEncrypted(encryptSecret('Harbor-Guest 2024!'))).toBe(true);
  });

  it('treats legacy plaintext Wi-Fi passwords as not encrypted', () => {
    expect(isEncrypted('Harbor-Guest 2024!')).toBe(false);
    expect(isEncrypted('sunshine')).toBe(false);
    expect(isEncrypted('')).toBe(false);
  });

  it('reports whether a Wi-Fi encryption key is configured', () => {
    expect(isEncryptionConfigured()).toBe(false);

    config.WIFI_ENCRYPTION_KEY = 'k'.repeat(32);

    expect(isEncryptionConfigured()).toBe(true);
  });
});
