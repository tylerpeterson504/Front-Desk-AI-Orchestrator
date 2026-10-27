import { getRepository } from '../src/config/database';
import { Property } from '../src/entities/Property';
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
  const shiftNoteRepo = { find: jest.fn() };
  const propertyRepo = { findOne: jest.fn() };
  return {
    getRepository: jest.fn((entity: any) => (entity.name === 'Property' ? propertyRepo : shiftNoteRepo)),
  };
});

const shiftNoteRepo = getRepository(ShiftNote) as any;
const propertyRepo = getRepository(Property) as any;

function note(performanceScore: string | number | null) {
  return {
    performance_score: performanceScore,
    is_complete: false,
    status: 'draft',
    handover_checklist: null,
    tasks: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  propertyRepo.findOne.mockResolvedValue({ id: 1 });
});

describe('ShiftNoteService performance report', () => {
  it('averages performance scores that the database returns as numeric strings', async () => {
    shiftNoteRepo.find.mockResolvedValue([note('4.50'), note('3.00')]);

    const report = await shiftNoteService.getPerformanceReport(1, '2026-10-01', '2026-10-07', 'u1');

    expect(report.avg_performance_score).toBe(3.75);
  });

  it('leaves missing scores out of the string-valued average', async () => {
    shiftNoteRepo.find.mockResolvedValue([note('4.00'), note(null), note('2.00')]);

    const report = await shiftNoteService.getPerformanceReport(1, '2026-10-01', '2026-10-07', 'u1');

    expect(report.avg_performance_score).toBe(3);
  });

  it('averages performance scores that are already numbers', async () => {
    shiftNoteRepo.find.mockResolvedValue([note(5), note(4)]);

    const report = await shiftNoteService.getPerformanceReport(1, '2026-10-01', '2026-10-07', 'u1');

    expect(report.avg_performance_score).toBe(4.5);
  });
});
