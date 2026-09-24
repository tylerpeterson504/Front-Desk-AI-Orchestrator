import { decryptSecret, encryptSecret, isEncrypted, migrateSecret, tryDecryptLegacySecret } from '../src/lib/secretBox';
import { getRepository } from '../src/config/database';
import { PropertyService } from '../src/services/propertyService';

jest.mock('../src/config/database', () => ({ getRepository: jest.fn() }));

describe('Wi-Fi password formats', () => {
  it('marks new ciphertext and decrypts it', () => {
    const encrypted = encryptSecret('guest-password');
    expect(encrypted).toMatch(/^v1:/);
    expect(isEncrypted(encrypted)).toBe(true);
    expect(decryptSecret(encrypted)).toBe('guest-password');
  });

  it('can authenticate and mark legacy ciphertext without changing its payload', () => {
    const legacy = encryptSecret('old-password').slice(3);
    expect(isEncrypted(legacy)).toBe(false);
    expect(tryDecryptLegacySecret(legacy)).toBe('old-password');
    expect(migrateSecret(legacy)).toBe(`v1:${legacy}`);
    expect(decryptSecret(`v1:${legacy}`)).toBe('old-password');
    expect(decryptSecret(legacy)).toBe('old-password');
  });

  it('does not mistake long valid Base64 plaintext for ciphertext', () => {
    const plaintext = 'QUJD'.repeat(20);
    expect(isEncrypted(plaintext)).toBe(false);
    expect(tryDecryptLegacySecret(plaintext)).toBeNull();
    expect(decryptSecret(migrateSecret(plaintext))).toBe(plaintext);
  });

  it('returns a Base64 legacy password unchanged through the Wi-Fi endpoint', async () => {
    const plaintext = 'QUJD'.repeat(20);
    (getRepository as jest.Mock).mockReturnValue({ findOne: jest.fn().mockResolvedValue({ wifi_ssid: 'Guest', wifi_password: plaintext }) });
    const password = await new PropertyService().getWifiPassword(1);
    expect(password).toEqual({ ssid: 'Guest', password: plaintext });
  });
});
