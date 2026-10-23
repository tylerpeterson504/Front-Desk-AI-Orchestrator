import { encryptSecret } from '../src/lib/secretBox';

const propRepo: any = { findOne: jest.fn(), save: jest.fn() };
const groupRepo: any = { findOne: jest.fn() };

jest.mock('../src/config/database', () => ({
  getRepository: jest.fn((entity: any) => (entity.name === 'PropertyGroup' ? groupRepo : propRepo)),
}));

// Imported dynamically: the service captures repositories as class fields at
// module load, so the mock repos above must be initialized first.
let propertyService: (typeof import('../src/services/propertyService'))['propertyService'];

beforeAll(() => {
  ({ propertyService } = require('../src/services/propertyService'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PropertyService Wi-Fi password', () => {
  describe('update', () => {
    it('clears the stored Wi-Fi password when an empty value is submitted', async () => {
      propRepo.findOne.mockResolvedValue({
        id: 1,
        user_id: 'u1',
        name: 'Harbor House',
        wifi_password: encryptSecret('Harbor-Guest 2024!'),
      });
      propRepo.save.mockImplementation(async (property: any) => property);

      await propertyService.update(1, { name: 'Harbor House', wifi_password: '' }, 'u1');

      expect(propRepo.save).toHaveBeenCalledWith(expect.objectContaining({ wifi_password: null }));
    });
  });

  describe('getWifiPassword', () => {
    it('returns the decrypted password for an encrypted value', async () => {
      propRepo.findOne.mockResolvedValue({
        wifi_ssid: 'Harbor-Guest',
        wifi_password: encryptSecret('Harbor-Guest 2024!'),
      });

      await expect(propertyService.getWifiPassword(1, 'u1')).resolves.toEqual({
        ssid: 'Harbor-Guest',
        password: 'Harbor-Guest 2024!',
      });
    });

    it('returns a legacy plaintext password unchanged', async () => {
      propRepo.findOne.mockResolvedValue({
        wifi_ssid: 'Harbor-Guest',
        wifi_password: 'Harbor-Guest 2024!',
      });

      await expect(propertyService.getWifiPassword(1, 'u1')).resolves.toEqual({
        ssid: 'Harbor-Guest',
        password: 'Harbor-Guest 2024!',
      });
    });
  });
});
