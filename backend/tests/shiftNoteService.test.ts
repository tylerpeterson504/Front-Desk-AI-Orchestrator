import { getRepository } from '../src/config/database';
import { ShiftNote } from '../src/entities/ShiftNote';
import { shiftNoteService } from '../src/services/shiftNoteService';

jest.mock('../src/lib/logger', () => ({
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('../src/config/database', () => {
  const shiftNoteRepo = { find: jest.fn(async () => []) };
  const propertyRepo = {};
  return {
    getRepository: jest.fn((entity: any) => (entity.name === 'Property' ? propertyRepo : shiftNoteRepo)),
  };
});

const shiftNoteRepo = getRepository(ShiftNote) as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ShiftNoteService property attachment', () => {
  it('attaches the property with explicit columns that exclude wifi_password and user_id', async () => {
    await shiftNoteService.getAll('u1');

    const options = shiftNoteRepo.find.mock.calls[0][0];
    expect(options.relations).toEqual(['property']);
    const selected = Object.keys(options.select.property);
    expect(selected).toEqual(expect.arrayContaining(['id', 'name', 'wifi_ssid', 'checkout_time']));
    expect(selected).not.toContain('wifi_password');
    expect(selected).not.toContain('user_id');
  });
});
